/* End-to-end test: two engines on this machine talking over real HTTP. */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ChatEngine, dmId, safeFileName, compareVersions, describeNetError } = require('../src/main/engine');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'officelink-test-'));
const waitFor = async (fn, label, timeout = 15000) => {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

function makeEngine(name, port, extra = {}) {
  const dir = path.join(tmp, name);
  return new ChatEngine({
    dataDir: path.join(dir, 'data'),
    defaultDownloadDir: path.join(dir, 'downloads'),
    defaultName: name,
    httpPort: port,
    enableDiscovery: false,
    presenceInterval: 300,
    ...extra,
  });
}

async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

(async () => {
  const alice = makeEngine('alice', 47001);
  const bob = makeEngine('bob', 47101);
  await alice.start();
  await bob.start();

  // Manual add in one direction is enough; the hello registers both sides.
  await alice.addPeerByAddress('127.0.0.1', bob.port);
  await waitFor(() => bob.isOnline(alice.me.id), 'bob sees alice');
  await waitFor(
    () => alice.getConv('general').some((m) => m.system && /bob joined/i.test(m.text)),
    'alice sees bob joined'
  );
  await waitFor(
    () => bob.getConv('general').some((m) => m.system && /alice joined/i.test(m.text)),
    'bob sees alice joined'
  );
  console.log('✓ peers connect by IP');

  const carol = makeEngine('carol', 47201);
  await carol.start();
  await bob.addPeerByAddress('127.0.0.1', carol.port);
  await waitFor(() => alice.isOnline(carol.me.id), 'alice learns carol via gossip');
  await waitFor(() => carol.isOnline(alice.me.id), 'carol learns alice via gossip');
  await waitFor(
    () => alice.getConv('general').some((m) => m.system && /carol joined/i.test(m.text)),
    'alice is told carol joined'
  );
  await carol.stop();
  console.log('✓ a new device is introduced to everyone and shows as joined');

  const found = await alice.findUsers();
  assert.ok(found.peers >= 1, 'find users still lists known colleagues');
  assert.ok(found.online >= 1, 'find users reports online colleagues');
  console.log('✓ find users refreshes the colleague list');

  // Direct message, delivery + read receipts
  const dm = dmId(alice.me.id, bob.me.id);
  const sent = alice.sendText(dm, 'Hello Bob!');
  await waitFor(() => bob.findMessage(dm, sent.id), 'bob receives dm');
  await waitFor(() => alice.findMessage(dm, sent.id).deliveredTo.includes(bob.me.id), 'delivered tick');
  assert.strictEqual(bob.getState().convs[dm].unread, 1);
  bob.setActive(dm, true);
  await waitFor(() => (alice.findMessage(dm, sent.id).readBy || []).includes(bob.me.id), 'read tick');
  assert.strictEqual(bob.getState().convs[dm].unread, 0);
  console.log('✓ direct message with delivered/read receipts');

  // Reply, reaction, edit, delete
  const reply = bob.sendText(dm, 'Hi Alice', sent.id);
  await waitFor(() => alice.findMessage(dm, reply.id), 'reply arrives');
  assert.strictEqual(alice.findMessage(dm, reply.id).replyTo.id, sent.id);
  alice.react(dm, reply.id, '👍');
  await waitFor(() => (bob.findMessage(dm, reply.id).reactions['👍'] || []).includes(alice.me.id), 'reaction');
  alice.editMessage(dm, sent.id, 'Hello Bob (edited)');
  await waitFor(() => bob.findMessage(dm, sent.id).text === 'Hello Bob (edited)', 'edit');
  alice.deleteMessage(dm, sent.id);
  await waitFor(() => bob.findMessage(dm, sent.id).deleted, 'delete');
  console.log('✓ reply, reactions, edit, delete');

  // General channel + typing
  let typingSeen = false;
  bob.on('typing', (e) => (typingSeen = e.convId === 'general' && e.userId === alice.me.id));
  alice.typing('general');
  const g = alice.sendText('general', 'Morning everyone');
  await waitFor(() => bob.findMessage('general', g.id), 'general message');
  await waitFor(() => typingSeen, 'typing indicator');
  console.log('✓ general channel and typing indicator');

  // Groups
  const groupId = alice.createGroup('Design team', [bob.me.id]);
  await waitFor(() => bob.getState().groups.find((x) => x.id === groupId), 'bob joins group');
  const gm = bob.sendText(groupId, 'Thanks for adding me');
  await waitFor(() => alice.findMessage(groupId, gm.id), 'group message');
  console.log('✓ group creation and messaging');

  // Large file transfer (200 MB) with integrity check
  const bigFile = path.join(tmp, 'big-report.bin');
  const SIZE = 200 * 1024 * 1024;
  const fd = fs.openSync(bigFile, 'w');
  const block = crypto.randomBytes(4 * 1024 * 1024);
  for (let off = 0; off < SIZE; off += block.length) fs.writeSync(fd, block, 0, block.length, off);
  fs.closeSync(fd);
  const srcHash = await sha256(bigFile);

  await alice.sendFiles(dm, [bigFile]);
  const fileMsg = await waitFor(
    () => bob.getConv(dm).find((m) => m.file && m.file.name === 'big-report.bin'),
    'file offer arrives'
  );
  assert.strictEqual(fileMsg.file.state, 'available', 'large file should not auto-download');
  let progressEvents = 0;
  bob.on('transfer', () => progressEvents++);
  const t0 = Date.now();
  bob.downloadFile(dm, fileMsg.id);
  await waitFor(() => fileMsg.file.state === 'done' || fileMsg.file.state === 'failed', 'download finishes', 120000);
  assert.strictEqual(fileMsg.file.state, 'done', fileMsg.file.error);
  const secs = (Date.now() - t0) / 1000;
  assert.strictEqual(await sha256(fileMsg.file.localPath), srcHash);
  assert(progressEvents > 0, 'progress events emitted');
  await waitFor(
    () => (alice.getConv(dm).find((m) => m.file && m.file.name === 'big-report.bin').file.downloadedBy || []).includes(bob.me.id),
    'downloaded-by receipt'
  );
  console.log(`✓ 200 MB file transferred intact in ${secs.toFixed(1)}s (${(200 / secs).toFixed(0)} MB/s over loopback)`);

  // Resume: pre-create half a partial file, then download again
  await alice.sendFiles(dm, [bigFile]);
  const second = await waitFor(
    () => bob.getConv(dm).filter((m) => m.file && m.file.name === 'big-report.bin')[1],
    'second offer'
  );
  const partDir = path.join(bob.settings.downloadDir, '.officelink-partial');
  fs.mkdirSync(partDir, { recursive: true });
  const partial = path.join(partDir, `${second.file.id}.part`);
  fs.writeFileSync(partial, fs.readFileSync(bigFile).subarray(0, SIZE / 2));
  let firstProgress = null;
  bob.on('transfer', (e) => {
    if (e.fileId === second.file.id && firstProgress === null) firstProgress = e.received;
  });
  bob.downloadFile(dm, second.id);
  await waitFor(() => second.file.state === 'done' || second.file.state === 'failed', 'resume finishes', 120000);
  assert.strictEqual(second.file.state, 'done', second.file.error);
  assert(firstProgress >= SIZE / 2, 'download resumed from partial offset');
  assert.strictEqual(await sha256(second.file.localPath), srcHash);
  assert.notStrictEqual(second.file.localPath, fileMsg.file.localPath, 'duplicate names get unique paths');
  console.log('✓ interrupted download resumes from where it stopped');

  // Small files auto-download
  const small = path.join(tmp, 'notes.txt');
  fs.writeFileSync(small, 'meeting notes');
  await alice.sendFiles('general', [small]);
  const smallMsg = await waitFor(() => bob.getConv('general').find((m) => m.file && m.file.name === 'notes.txt'), 'small file');
  await waitFor(() => smallMsg.file.state === 'done', 'auto-download');
  assert.strictEqual(fs.readFileSync(smallMsg.file.localPath, 'utf8'), 'meeting notes');
  console.log('✓ small files auto-download');

  // Pin, mute, mentions, forward, DND
  alice.togglePin('general');
  assert(alice.getState().pinned.includes('general'));
  alice.toggleMute(dm);
  assert(alice.getState().muted.includes(dm));
  const mentioned = alice.sendText('general', `Hello @${bob.me.name}`);
  await waitFor(() => bob.findMessage('general', mentioned.id), 'mention message');
  assert((bob.findMessage('general', mentioned.id).mentions || []).includes(bob.me.id));
  const fwdSrc = bob.sendText(dm, 'please forward this');
  await waitFor(() => alice.findMessage(dm, fwdSrc.id), 'forward source');
  alice.forwardMessage(dm, fwdSrc.id, 'general');
  await waitFor(
    () => alice.getConv('general').find((m) => m.text === 'please forward this' && m.forwarded),
    'forwarded locally'
  );
  await waitFor(
    () => bob.getConv('general').find((m) => m.text === 'please forward this' && m.forwarded),
    'forwarded to bob'
  );
  let busyNotes = 0;
  bob.updateProfile({ status: 'busy' });
  bob.on('notify', () => busyNotes++);
  const plain = alice.sendText('general', 'just a ping');
  await waitFor(() => bob.findMessage('general', plain.id), 'plain while busy');
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(busyNotes, 0, 'Do not disturb suppresses ordinary notifications');
  const mentionBusy = alice.sendText('general', `need you @${bob.me.name}`);
  await waitFor(() => bob.findMessage('general', mentionBusy.id), 'mention while busy');
  await waitFor(() => busyNotes > 0, 'mention still notifies when busy');
  console.log('✓ pin, mute, @mentions, forward, and do-not-disturb');

  alice.updateProfile({ name: 'Alice Prime' });
  await waitFor(() => bob.peersFile.data[alice.me.id]?.name === 'Alice Prime', 'name change reaches peer');
  const bobPeer = alice.peersFile.data[bob.me.id];
  const savedIp = bobPeer.ip;
  bobPeer.ip = '';
  const pulled = alice.sendText(dm, 'mac-pull-path');
  assert((alice.outboxFile.data[bob.me.id] || []).some((e) => e.message && e.message.id === pulled.id));
  bobPeer.ip = savedIp;
  await waitFor(() => bob.findMessage(dm, pulled.id), 'queued message delivered by pull');
  console.log('✓ name changes and pull-delivery stay in sync');

  // Mac → Windows bug: the saved address is dead (Wi-Fi slept / DHCP moved it),
  // UDP presence says "offline", but the colleague's other address works.
  // Pull is disabled on bob's side so only alice's push can deliver.
  const aliceOnBob = bob.peersFile.data[alice.me.id];
  const aliceAddr = { ip: aliceOnBob.ip, ips: aliceOnBob.ips };
  Object.assign(aliceOnBob, { ip: '', ips: [] });
  Object.assign(bobPeer, { ip: '127.0.0.9', ips: ['127.0.0.9', '127.0.0.1'] });
  alice.seen.delete(bob.me.id);
  const pushed = alice.sendText(dm, 'push-with-stale-ip');
  const shown = alice.getMessages(dm).messages.find((m) => m.id === pushed.id);
  assert.strictEqual(shown.waiting, 1, 'queued message is shown as waiting');
  await waitFor(() => bob.findMessage(dm, pushed.id), 'push delivered via second address', 20000);
  assert.notStrictEqual(bobPeer.ip, '127.0.0.9', 'a working address becomes preferred');
  await waitFor(() => !alice.getMessages(dm).messages.find((m) => m.id === pushed.id).waiting, 'waiting flag clears');
  Object.assign(aliceOnBob, aliceAddr);
  const probe = await alice.testPeer(bob.me.id);
  assert.ok(probe.ok, 'connection test succeeds');
  assert.ok(probe.results.some((r) => r.ok && r.ip === '127.0.0.1'));
  assert.strictEqual(describeNetError({ code: 'ECONNREFUSED' }), 'Computer is on, but OfficeLink is not running there');
  assert.match(describeNetError(new Error('Request timed out')), /firewall/);
  console.log('✓ queued messages reach a colleague through any of their addresses');

  const codeA = path.join(tmp, 'code-a');
  const codeB = path.join(tmp, 'code-b');
  for (const [root, label] of [
    [codeA, 'alpha'],
    [codeB, 'beta'],
  ]) {
    fs.mkdirSync(path.join(root, 'src', 'main'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'officelink', version: '9.0.0' }));
    fs.writeFileSync(path.join(root, 'src', 'main', 'main.js'), `console.log('${label}');\n`);
    fs.writeFileSync(path.join(root, 'src', 'main', 'engine.js'), `module.exports = '${label}';\n`);
  }
  const codeAlice = makeEngine('codeAlice', 47201, { codeRoot: codeA });
  const codeBob = makeEngine('codeBob', 47301, { codeRoot: codeB });
  await codeAlice.start();
  await codeBob.start();
  await codeAlice.addPeerByAddress('127.0.0.1', codeBob.port);
  const pack = await codeBob.request('127.0.0.1', codeAlice.port, 'GET', '/updates/code.json', null, 4000);
  assert.strictEqual(pack.version, '9.0.0');
  assert(pack.files['src/main/main.js'].includes('alpha'));
  assert.notStrictEqual(pack.sha, codeBob.codePack().sha);
  assert.strictEqual(codeAlice.publicProfile().rev, pack.sha.slice(0, 16));
  await codeAlice.stop();
  await codeBob.stop();
  console.log('✓ Settings Update can fetch the latest code from a colleague');

  // Offline queue: bob goes away, alice sends, bob comes back
  const bobPort = bob.port;
  await bob.stop();
  alice.seen.delete(bob.me.id);
  const queued = alice.sendText(dm, 'Are you there?');
  assert.strictEqual(alice.outboxFile.data[bob.me.id].length > 0, true);
  const bob2 = makeEngine('bob', bobPort);
  await bob2.start();
  await bob2.addPeerByAddress('127.0.0.1', alice.port);
  await waitFor(() => bob2.findMessage(dm, queued.id), 'queued message delivered after reconnect');
  console.log('✓ messages to offline colleagues are queued and delivered later');

  // History persisted across restart
  assert(bob2.findMessage(dm, reply.id), 'history survives restart');
  console.log('✓ chat history persists across restarts');

  bob2.clearConversation(dm);
  assert.strictEqual(bob2.getMessages(dm).messages.length, 0);
  assert.ok(alice.findMessage(dm, reply.id), 'clearing is local to one computer');
  console.log('✓ clear chat removes history on this computer only');

  // Workspace isolation
  bob2.updateSettings({ workspace: 'finance' });
  await assert.rejects(() => alice.addPeerByAddress('127.0.0.1', bob2.port), /different workspace/);
  console.log('✓ different workspace names are isolated');

  assert.strictEqual(safeFileName('../../etc/passwd'), 'passwd');
  assert.strictEqual(safeFileName('..\\..\\evil.exe'), 'evil.exe');
  assert.strictEqual(safeFileName('con.txt'), '_con.txt');
  console.log('✓ received file names are sanitized');

  await alice.stop();
  await bob2.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nAll tests passed');
  process.exit(0);
})().catch((err) => {
  console.error('✗', err);
  process.exit(1);
});

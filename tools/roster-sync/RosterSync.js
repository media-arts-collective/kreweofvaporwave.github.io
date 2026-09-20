/**
 * VKV roster sync. Members mail their pseudonym to ROSTER_ADDRESS; a polling
 * trigger rebuilds members.json and commits it to GitHub.
 *
 * The From header is the identity -- the address someone mails from is the one
 * they are on the list with. Nothing is typed, nothing is verified, and nothing
 * needs a login. Latest mail per sender wins, so **sending again is how you
 * change your pseudonym**.
 *
 * Sender addresses are read only to key that dedupe. They are never written to
 * members.json, never committed, and never leave Google.
 *
 * Script Properties:
 *   GITHUB_TOKEN   fine-grained PAT, Contents: read/write, this repo only
 *   GITHUB_REPO    media-arts-collective/kreweofvaporwave.github.io
 *                  The ORG repo -- this clone's `origin`, live, Pages-served.
 *                  `kreweofvaporwave/kreweofvaporwave.github.io` is a DIFFERENT
 *                  repo: the 2019 user-account original, stale, and what
 *                  `gh repo view` resolves to because `upstream` is gh-resolved.
 *   GITHUB_BRANCH  master
 */

var ROSTER_ADDRESS = 'roster@kreweofvaporwave.com';
var ROSTER_PATH = 'members.json';
var MAX_THREADS = 300;

function syncRoster() {
  var payload = JSON.stringify({ names: rosterFromResponses(collectMail_()) }, null, 2) + '\n';
  commitIfChanged_(ROSTER_PATH, payload);
}

/**
 * Every message ever sent to the address, oldest first -- not just unread ones.
 * The file is rebuilt from scratch each run, so the mailbox is the record and
 * nothing depends on read state or labels surviving.
 */
function collectMail_() {
  var messages = [];
  GmailApp.search('to:' + ROSTER_ADDRESS, 0, MAX_THREADS).forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      messages.push(message);
    });
  });

  messages.sort(function (a, b) {
    return a.getDate() - b.getDate();
  });

  return messages.map(function (message) {
    return {
      email: parseSender(message.getFrom()),
      pseudonym: parsePseudonym(message.getSubject(), message.getPlainBody())
    };
  });
}

/** "Dat Boi <a@example.com>" -> "a@example.com"; a bare address passes through. */
function parseSender(from) {
  var angled = String(from || '').match(/<([^>]+)>/);
  return (angled ? angled[1] : String(from || '')).trim().toLowerCase();
}

/**
 * The mailto link prefills `Subject: pseudonym: `, so the subject is the happy
 * path. Someone who clears it and types in the body still works: first line
 * that is not quoted, not a signature, and not empty.
 *
 * Mirrored in TestsLocal.js -- change both.
 */
function parsePseudonym(subject, body) {
  var tagged = String(subject || '').match(/pseudonym\s*[:\-]\s*(.+)/i);
  if (tagged && tagged[1].trim()) return tagged[1].trim();

  var lines = String(body || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === '>') continue;
    if (line === '--' || line.indexOf('-- ') === 0) break;
    if (/^on .*wrote:$/i.test(line)) break;
    return line;
  }

  var bare = String(subject || '').trim();
  return /^(re|fwd)\s*:/i.test(bare) ? '' : bare;
}

/**
 * Latest message per sender wins, which is what makes mailing again the edit
 * mechanism. collectMail_ sorts oldest-first, so a later message simply
 * overwrites the earlier key.
 *
 * Mirrored in TestsLocal.js -- change both.
 */
function rosterFromResponses(responses) {
  var byRespondent = {};
  var anonymous = [];

  responses.forEach(function (entry) {
    var pseudonym = (entry.pseudonym || '').trim();
    if (!pseudonym) return;
    var email = (entry.email || '').trim().toLowerCase();
    if (email) byRespondent[email] = pseudonym;
    else anonymous.push(pseudonym);
  });

  var names = Object.keys(byRespondent).map(function (email) {
    return byRespondent[email];
  });

  var seen = {};
  return names.concat(anonymous).filter(function (name) {
    var key = name.toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort();
}

function commitIfChanged_(path, content) {
  var props = PropertiesService.getScriptProperties();
  var repo = props.getProperty('GITHUB_REPO');
  var branch = props.getProperty('GITHUB_BRANCH') || 'master';
  var token = props.getProperty('GITHUB_TOKEN');
  if (!repo || !token) throw new Error('Set GITHUB_REPO and GITHUB_TOKEN in Script Properties.');

  var url = 'https://api.github.com/repos/' + repo + '/contents/' + path;
  var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
  var encoded = Utilities.base64Encode(content, Utilities.Charset.UTF_8);

  var existing = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(branch), {
    headers: headers, muteHttpExceptions: true
  });

  var sha = null;
  if (existing.getResponseCode() === 200) {
    var current = JSON.parse(existing.getContentText());
    sha = current.sha;
    // GitHub wraps base64 at 60 chars; strip whitespace before comparing.
    if (current.content.replace(/\s/g, '') === encoded) return;
  } else if (existing.getResponseCode() !== 404) {
    throw new Error('GitHub read failed: ' + existing.getContentText());
  }

  var body = {
    message: 'Roster: sync pseudonyms from the mailbox',
    content: encoded,
    branch: branch,
    committer: { name: 'VKV Roster Overlord', email: 'noreply@kreweofvaporwave.com' }
  };
  if (sha) body.sha = sha;

  var written = UrlFetchApp.fetch(url, {
    method: 'put', headers: headers, contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true
  });

  if (written.getResponseCode() >= 300) {
    throw new Error('GitHub write failed: ' + written.getContentText());
  }
}

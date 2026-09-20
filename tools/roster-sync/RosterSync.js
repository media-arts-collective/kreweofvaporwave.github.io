/**
 * VKV roster sync. Form submit -> rebuild members.json -> commit to GitHub.
 *
 * Email addresses are read here only to key the dedupe. They are never written
 * to members.json, never committed, and never leave Google.
 *
 * Script Properties:
 *   GITHUB_TOKEN   fine-grained PAT, Contents: read/write, this repo only
 *   GITHUB_REPO    kreweofvaporwave/kreweofvaporwave.github.io
 *                  (canonical slug; the website remote's media-arts-collective
 *                   path only works by 301, and a redirected PUT drops its body)
 *   GITHUB_BRANCH  master
 *   FORM_ID        written by setup()
 */

var ROSTER_PATH = 'members.json';

function syncRoster() {
  var formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) throw new Error('FORM_ID missing — run setup() first.');

  var responses = FormApp.openById(formId).getResponses().map(function (response) {
    var pseudonym = '';
    response.getItemResponses().forEach(function (item) {
      if (item.getItem().getTitle().trim() === PSEUDONYM_QUESTION) {
        pseudonym = String(item.getResponse()).trim();
      }
    });
    return { email: response.getRespondentEmail() || '', pseudonym: pseudonym };
  });

  var payload = JSON.stringify({ names: rosterFromResponses(responses) }, null, 2) + '\n';
  commitIfChanged_(ROSTER_PATH, payload);
}

/**
 * Latest response per respondent wins, which is what makes resubmitting the
 * form the edit mechanism. getResponses() returns oldest-first, so a later
 * submission simply overwrites the earlier key.
 *
 * Mirrored in TestsLocal.js — change both.
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
    message: 'Roster: sync pseudonyms from the form',
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

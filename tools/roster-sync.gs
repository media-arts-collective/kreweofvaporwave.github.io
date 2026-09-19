/**
 * VKV roster sync. Runs in Apps Script, bound to the pseudonym Form.
 * Form submit -> rebuild members.json -> commit to GitHub.
 *
 * Email addresses are read here and never written anywhere. The only thing
 * that leaves this script is a list of pseudonyms.
 *
 * Setup:
 *   1. Open the Form -> three dots -> Apps Script. Paste this file.
 *   2. Project Settings -> Script Properties:
 *        GITHUB_TOKEN   fine-grained PAT, Contents: read/write, this repo only
 *        GITHUB_REPO    media-arts-collective/kreweofvaporwave.github.io
 *        GITHUB_BRANCH  master
 *   3. Triggers -> Add trigger -> syncRoster -> From form -> On form submit.
 *   4. Run syncRoster once by hand to authorize and to seed the file.
 */

var PSEUDONYM_QUESTION = 'Pseudonym';
var ROSTER_PATH = 'members.json';

function syncRoster() {
  var names = collectNames_();
  var payload = JSON.stringify({ names: names }, null, 2) + '\n';
  commitIfChanged_(ROSTER_PATH, payload);
}

/**
 * Latest submission per respondent wins, so resubmitting the form is how a
 * member edits their pseudonym. Responses are returned oldest-first, so a
 * later one simply overwrites the earlier key.
 */
function collectNames_() {
  var byRespondent = {};
  var anonymous = [];

  FormApp.getActiveForm().getResponses().forEach(function (response) {
    var pseudonym = '';
    response.getItemResponses().forEach(function (item) {
      if (item.getItem().getTitle().trim() === PSEUDONYM_QUESTION) {
        pseudonym = String(item.getResponse()).trim();
      }
    });
    if (!pseudonym) return;

    var email = (response.getRespondentEmail() || '').trim().toLowerCase();
    if (email) {
      byRespondent[email] = pseudonym;
    } else {
      anonymous.push(pseudonym);
    }
  });

  var names = Object.keys(byRespondent).map(function (email) {
    return byRespondent[email];
  });
  return dedupe_(names.concat(anonymous)).sort();
}

function dedupe_(names) {
  var seen = {};
  return names.filter(function (name) {
    var key = name.toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function commitIfChanged_(path, content) {
  var props = PropertiesService.getScriptProperties();
  var repo = props.getProperty('GITHUB_REPO');
  var branch = props.getProperty('GITHUB_BRANCH') || 'master';
  var token = props.getProperty('GITHUB_TOKEN');
  if (!repo || !token) throw new Error('Set GITHUB_REPO and GITHUB_TOKEN in Script Properties.');

  var url = 'https://api.github.com/repos/' + repo + '/contents/' + path;
  var headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json'
  };

  var existing = UrlFetchApp.fetch(url + '?ref=' + encodeURIComponent(branch), {
    headers: headers,
    muteHttpExceptions: true
  });

  var sha = null;
  if (existing.getResponseCode() === 200) {
    var current = JSON.parse(existing.getContentText());
    sha = current.sha;
    // GitHub wraps base64 at 60 chars; strip whitespace before comparing.
    if (current.content.replace(/\s/g, '') === Utilities.base64Encode(content, Utilities.Charset.UTF_8)) {
      return;
    }
  } else if (existing.getResponseCode() !== 404) {
    throw new Error('GitHub read failed: ' + existing.getContentText());
  }

  var body = {
    message: 'Roster: sync pseudonyms from the form',
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: branch,
    committer: { name: 'VKV Roster Overlord', email: 'noreply@kreweofvaporwave.com' }
  };
  if (sha) body.sha = sha;

  var written = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  if (written.getResponseCode() >= 300) {
    throw new Error('GitHub write failed: ' + written.getContentText());
  }
}

/**
 * Fast local suite, no Apps Script dependencies: node TestsLocal.js
 *
 * Per repo convention this re-declares the logic under test inline, because
 * plain node cannot load Apps Script globals. Mirror any change to
 * rosterFromResponses, parseSender or parsePseudonym in RosterSync.js here, or
 * this suite tests stale logic.
 */

function parseSender(from) {
  var angled = String(from || '').match(/<([^>]+)>/);
  return (angled ? angled[1] : String(from || '')).trim().toLowerCase();
}

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

var failures = 0;
function check(label, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) return console.log('  ok   ' + label);
  failures++;
  console.log('  FAIL ' + label + '\n       got      ' + a + '\n       expected ' + e);
}

console.log('rosterFromResponses');

check('resubmission edits rather than duplicates',
  rosterFromResponses([
    { email: 'a@example.com', pseudonym: 'Old Name' },
    { email: 'a@example.com', pseudonym: 'New Name' }
  ]),
  ['New Name']);

check('email match is case-insensitive',
  rosterFromResponses([
    { email: 'A@Example.com', pseudonym: 'First' },
    { email: 'a@example.com', pseudonym: 'Second' }
  ]),
  ['Second']);

check('two people may not share a pseudonym',
  rosterFromResponses([
    { email: 'a@example.com', pseudonym: 'Dat Boi' },
    { email: 'b@example.com', pseudonym: 'dat boi' }
  ]),
  ['Dat Boi']);

check('blank pseudonyms are dropped',
  rosterFromResponses([
    { email: 'a@example.com', pseudonym: '   ' },
    { email: 'b@example.com', pseudonym: 'Zygote' }
  ]),
  ['Zygote']);

check('responses without an email are kept, not collapsed',
  rosterFromResponses([
    { email: '', pseudonym: 'Anon One' },
    { email: '', pseudonym: 'Anon Two' }
  ]),
  ['Anon One', 'Anon Two']);

check('empty mailbox yields an empty roster', rosterFromResponses([]), []);

console.log('parseSender');

check('display name is stripped', parseSender('Dat Boi <A@Example.com>'), 'a@example.com');
check('bare address passes through', parseSender(' b@example.com '), 'b@example.com');

console.log('parsePseudonym');

check('the mailto subject is the happy path',
  parsePseudonym('pseudonym: Dat Boi', ''), 'Dat Boi');

check('a cleared subject falls back to the first body line',
  parsePseudonym('', 'Zygote\n\nsent from my phone'), 'Zygote');

check('quoted replies and signatures are skipped',
  parsePseudonym('', '> pseudonym: Old Name\nNew Name\n-- \nsig'), 'New Name');

check('a signature before any content yields nothing',
  parsePseudonym('', '-- \nZach'), '');

check('a bare Re: subject with no body is not a pseudonym',
  parsePseudonym('Re: something', ''), '');

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);

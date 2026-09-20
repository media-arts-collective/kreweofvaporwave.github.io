/**
 * Fast local suite, no Apps Script dependencies: node TestsLocal.js
 *
 * Per repo convention this re-declares the logic under test inline, because
 * plain node cannot load Apps Script globals. Mirror any change to
 * rosterFromResponses in RosterSync.js here, or this suite tests stale logic.
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

check('empty form yields an empty roster', rosterFromResponses([]), []);

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);

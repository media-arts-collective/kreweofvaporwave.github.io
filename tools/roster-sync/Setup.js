/**
 * One-time setup. Installs the polling trigger. Run once from the Apps Script
 * editor after `clasp push`, which is also what authorizes the Gmail scope.
 *
 * There is no Form and no form-bound container: members mail ROSTER_ADDRESS and
 * the From header is the identity. See RosterSync.js.
 */

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('GITHUB_REPO')) {
    throw new Error('Set GITHUB_REPO to media-arts-collective/kreweofvaporwave.github.io first.');
  }
  githubToken_();  // fail here, not fifteen minutes from now on the first trigger

  ensureAlias_();

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncRoster') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncRoster').timeBased().everyMinutes(15).create();

  Logger.log('Trigger installed. Mail %s to test, then check members.json.', ROSTER_ADDRESS);
  syncRoster();
}

/**
 * Adds ROSTER_ADDRESS as an alias on whichever user runs this, via the Admin
 * SDK. This is a Workspace user in a domain we control, so unlike the consumer
 * Google Group behind `enlist@`, the Directory API genuinely covers it.
 *
 * An alias and not a routing rule: mail has to land in a mailbox for
 * GmailApp.search to find it, and a routing rule would send it elsewhere.
 *
 * Requires the executing account to be a Workspace super admin. Aliases usually
 * resolve within minutes; Google allows up to 24 hours.
 */
function ensureAlias_() {
  var user = Session.getEffectiveUser().getEmail();

  try {
    var existing = AdminDirectory.Users.Aliases.list(user).aliases || [];
    var present = existing.some(function (entry) {
      return String(entry.alias).toLowerCase() === ROSTER_ADDRESS.toLowerCase();
    });
    if (present) {
      Logger.log('%s already aliases to %s', ROSTER_ADDRESS, user);
      return;
    }

    AdminDirectory.Users.Aliases.insert({ alias: ROSTER_ADDRESS }, user);
    Logger.log('Added %s as an alias on %s', ROSTER_ADDRESS, user);
  } catch (err) {
    throw new Error('Could not add ' + ROSTER_ADDRESS + ' as an alias on ' + user
      + ' -- this needs a Workspace super admin. Add it by hand in Admin console '
      + '-> Users -> ' + user + ' -> Alternate email addresses. (' + err + ')');
  }
}

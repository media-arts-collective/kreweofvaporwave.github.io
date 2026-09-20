/**
 * One-time setup. Installs the polling trigger. Run once from the Apps Script
 * editor after `clasp push`, which is also what authorizes the Gmail scope.
 *
 * There is no Form and no form-bound container: members mail ROSTER_ADDRESS and
 * the From header is the identity. See RosterSync.js.
 */

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('GITHUB_TOKEN')) {
    throw new Error('Set GITHUB_TOKEN (fine-grained PAT, Contents: read/write) first.');
  }
  if (!props.getProperty('GITHUB_REPO')) {
    throw new Error('Set GITHUB_REPO to media-arts-collective/kreweofvaporwave.github.io first.');
  }

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncRoster') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncRoster').timeBased().everyMinutes(15).create();

  Logger.log('Trigger installed. Mail %s to test, then check members.json.', ROSTER_ADDRESS);
  syncRoster();
}

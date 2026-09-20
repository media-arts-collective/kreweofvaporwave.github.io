/**
 * One-time setup. Creates the pseudonym Form, configures it, and installs the
 * submit trigger. Run once from the Apps Script editor after `clasp push`.
 *
 * Standalone (not form-bound) on purpose: the Form is created here, so there is
 * no container to bind to at push time. FORM_ID lands in Script Properties.
 */

var PSEUDONYM_QUESTION = 'Pseudonym';

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('GITHUB_TOKEN')) {
    throw new Error('Set GITHUB_TOKEN (fine-grained PAT, Contents: read/write) first.');
  }

  var form = FormApp.create('Krewe of Vaporwave — pseudonym')
    .setDescription('Your pseudonym as it appears on kreweofvaporwave.com. '
      + 'Submit again any time to change it.')
    .setAllowResponseEdits(true)
    // Everyone on the list must be able to submit, including members on
    // non-Google addresses, so this stays off: it would force a Google sign-in.
    .setLimitOneResponsePerUser(false);

  collectEmails_(form);

  // The leak that matters: with this on, any respondent can read every
  // response, email addresses included.
  form.setPublishingSummary(false);

  form.addTextItem().setTitle(PSEUDONYM_QUESTION).setRequired(true);

  props.setProperty('FORM_ID', form.getId());
  installTrigger_(form);

  Logger.log('Form URL (put this on the members page): %s', form.getPublishedUrl());
  Logger.log('Editor: %s', form.getEditUrl());
}

/**
 * setEmailCollectionType is the current API; setCollectEmail is the deprecated
 * one still present on older runtimes. Try the new one, fall back, and fail
 * loudly rather than silently leaving collection off — the sync keys its
 * dedupe on the respondent email, so a silent failure means every resubmission
 * becomes a duplicate row instead of an edit.
 */
function collectEmails_(form) {
  try {
    form.setEmailCollectionType(FormApp.EmailCollectionType.RESPONDER_INPUT);
    return;
  } catch (err) {
    Logger.log('setEmailCollectionType unavailable (%s); trying setCollectEmail', err);
  }
  form.setCollectEmail(true);
}

function installTrigger_(form) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncRoster') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncRoster').forForm(form).onFormSubmit().create();
}

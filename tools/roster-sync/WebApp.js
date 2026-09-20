/**
 * The roster as JSON, for a caller that holds the GitHub credential.
 *
 * Apps Script's job is mailbox -> names. Who commits the file is a separate
 * concern, and this is the seam between them: deploy as a web app and anything
 * that can reach it can read the roster without this project holding a GitHub
 * credential of any kind.
 *
 * That matters because `unattended-vaporwave`'s private key lives on the
 * vaporwave host. Pulling it into Apps Script would copy the key to a second
 * place, and a key in two places is rotated in neither.
 *
 * Anonymous access is deliberate: the payload is the same list of pseudonyms
 * the website publishes. Sender addresses are never in it.
 */

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ names: rosterFromResponses(collectMail_()) }, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

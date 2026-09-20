/**
 * GitHub auth for Apps Script, via the estate's App rather than a PAT.
 *
 * A PAT is minted by hand in a web UI, once per project, forever. The App is
 * minted once for the estate: the same three properties work in every Apps
 * Script project that ever needs to write to GitHub, and the tokens they
 * produce expire in an hour instead of never.
 *
 * Script Properties (identical in every project -- copy, never re-mint):
 *   GITHUB_APP_ID           4813610
 *   GITHUB_INSTALLATION_ID  158679998   (unattended-vaporwave on media-arts-collective)
 *   GITHUB_APP_KEY          the PEM private key, downloaded once from the App
 *
 * This file is deliberately self-contained so it can be lifted into a shared
 * Apps Script library later -- the same way wavebucksCore is consumed by
 * scribaSenatus -- at which point even the three properties stop being copied.
 */

var TOKEN_CACHE_KEY = 'github_installation_token';
var TOKEN_CACHE_SECONDS = 2700; // GitHub gives an hour; refresh well inside it.

function githubToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var appId = props.getProperty('GITHUB_APP_ID');
  var installationId = props.getProperty('GITHUB_INSTALLATION_ID');
  var key = props.getProperty('GITHUB_APP_KEY');

  // A PAT still works if one is set: this is the migration path, not a fallback
  // to rely on. Remove GITHUB_TOKEN once the App is wired.
  var pat = props.getProperty('GITHUB_TOKEN');
  if (!appId || !installationId || !key) {
    if (pat) return pat;
    throw new Error('Set GITHUB_APP_ID, GITHUB_INSTALLATION_ID and GITHUB_APP_KEY.');
  }

  var response = UrlFetchApp.fetch(
    'https://api.github.com/app/installations/' + installationId + '/access_tokens',
    {
      method: 'post',
      headers: {
        Authorization: 'Bearer ' + appJwt_(appId, key),
        Accept: 'application/vnd.github+json'
      },
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() >= 300) {
    throw new Error('Installation token request failed: ' + response.getContentText());
  }

  var token = JSON.parse(response.getContentText()).token;
  cache.put(TOKEN_CACHE_KEY, token, TOKEN_CACHE_SECONDS);
  return token;
}

/**
 * GitHub requires an RS256 JWT signed by the App key, valid at most 10 minutes.
 * `iat` is backdated a minute because GitHub rejects a token issued in its own
 * future, and clock skew between Apps Script and GitHub is not ours to control.
 */
function appJwt_(appId, privateKey) {
  var now = Math.floor(Date.now() / 1000);
  var header = base64url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var payload = base64url_(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));

  var unsigned = header + '.' + payload;
  var signature = Utilities.computeRsaSha256Signature(unsigned, privateKey);
  return unsigned + '.' + base64urlBytes_(signature);
}

function base64url_(value) {
  return base64urlBytes_(Utilities.newBlob(value).getBytes());
}

function base64urlBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

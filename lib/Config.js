"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;

var _cache = _interopRequireDefault(require("./cache"));

var _SchemaCache = _interopRequireDefault(require("./Controllers/SchemaCache"));

var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));

var _net = _interopRequireDefault(require("net"));

var _Definitions = require("./Options/Definitions");

var _lodash = require("lodash");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.
function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }

  if (str.endsWith('/')) {
    str = str.substr(0, str.length - 1);
  }

  return str;
}

class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);

    if (!cacheInfo) {
      return;
    }

    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        const schemaCache = new _SchemaCache.default(cacheInfo.cacheController, cacheInfo.schemaCacheTTL, cacheInfo.enableSingleSchemaCache);
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter, schemaCache);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    return config;
  }

  static put(serverConfiguration) {
    Config.validate(serverConfiguration);

    _cache.default.put(serverConfiguration.appId, serverConfiguration);

    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }

  static validate({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    maxLimit,
    emailVerifyTokenValidityDuration,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    emailVerifyTokenReuseIfValid,
    fileUpload,
    pages
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }

    const emailAdapter = userController.adapter;

    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid
      });
    }

    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);
    this.validateFileUploadOptions(fileUpload);

    if (typeof revokeSessionOnPasswordReset !== 'boolean') {
      throw 'revokeSessionOnPasswordReset must be a boolean value';
    }

    if (publicServerURL) {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'publicServerURL should be a valid HTTPS URL starting with https://';
      }
    }

    this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    this.validateMasterKeyIps(masterKeyIps);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
  }

  static validatePagesOptions(pages) {
    if (Object.prototype.toString.call(pages) !== '[object Object]') {
      throw 'Parse Server option pages must be an object.';
    }

    if (pages.enableRouter === undefined) {
      pages.enableRouter = _Definitions.PagesOptions.enableRouter.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableRouter)) {
      throw 'Parse Server option pages.enableRouter must be a boolean.';
    }

    if (pages.enableLocalization === undefined) {
      pages.enableLocalization = _Definitions.PagesOptions.enableLocalization.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableLocalization)) {
      throw 'Parse Server option pages.enableLocalization must be a boolean.';
    }

    if (pages.localizationJsonPath === undefined) {
      pages.localizationJsonPath = _Definitions.PagesOptions.localizationJsonPath.default;
    } else if (!(0, _lodash.isString)(pages.localizationJsonPath)) {
      throw 'Parse Server option pages.localizationJsonPath must be a string.';
    }

    if (pages.localizationFallbackLocale === undefined) {
      pages.localizationFallbackLocale = _Definitions.PagesOptions.localizationFallbackLocale.default;
    } else if (!(0, _lodash.isString)(pages.localizationFallbackLocale)) {
      throw 'Parse Server option pages.localizationFallbackLocale must be a string.';
    }

    if (pages.placeholders === undefined) {
      pages.placeholders = _Definitions.PagesOptions.placeholders.default;
    } else if (Object.prototype.toString.call(pages.placeholders) !== '[object Object]' && typeof pages.placeholders !== 'function') {
      throw 'Parse Server option pages.placeholders must be an object or a function.';
    }

    if (pages.forceRedirect === undefined) {
      pages.forceRedirect = _Definitions.PagesOptions.forceRedirect.default;
    } else if (!(0, _lodash.isBoolean)(pages.forceRedirect)) {
      throw 'Parse Server option pages.forceRedirect must be a boolean.';
    }

    if (pages.pagesPath === undefined) {
      pages.pagesPath = _Definitions.PagesOptions.pagesPath.default;
    } else if (!(0, _lodash.isString)(pages.pagesPath)) {
      throw 'Parse Server option pages.pagesPath must be a string.';
    }

    if (pages.pagesEndpoint === undefined) {
      pages.pagesEndpoint = _Definitions.PagesOptions.pagesEndpoint.default;
    } else if (!(0, _lodash.isString)(pages.pagesEndpoint)) {
      throw 'Parse Server option pages.pagesEndpoint must be a string.';
    }

    if (pages.customUrls === undefined) {
      pages.customUrls = _Definitions.PagesOptions.customUrls.default;
    } else if (Object.prototype.toString.call(pages.customUrls) !== '[object Object]') {
      throw 'Parse Server option pages.customUrls must be an object.';
    }

    if (pages.customRoutes === undefined) {
      pages.customRoutes = _Definitions.PagesOptions.customRoutes.default;
    } else if (!(pages.customRoutes instanceof Array)) {
      throw 'Parse Server option pages.customRoutes must be an array.';
    }
  }

  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }

    if (idempotencyOptions.ttl === undefined) {
      idempotencyOptions.ttl = _Definitions.IdempotencyOptions.ttl.default;
    } else if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }

    if (!idempotencyOptions.paths) {
      idempotencyOptions.paths = _Definitions.IdempotencyOptions.paths.default;
    } else if (!(idempotencyOptions.paths instanceof Array)) {
      throw 'idempotency paths must be of an array of strings';
    }
  }

  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }

      if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }

      if (accountLockout.unlockOnPasswordReset === undefined) {
        accountLockout.unlockOnPasswordReset = _Definitions.AccountLockoutOptions.unlockOnPasswordReset.default;
      } else if (!(0, _lodash.isBoolean)(accountLockout.unlockOnPasswordReset)) {
        throw 'Parse Server option accountLockout.unlockOnPasswordReset must be a boolean.';
      }
    }
  }

  static validatePasswordPolicy(passwordPolicy) {
    if (passwordPolicy) {
      if (passwordPolicy.maxPasswordAge !== undefined && (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)) {
        throw 'passwordPolicy.maxPasswordAge must be a positive number';
      }

      if (passwordPolicy.resetTokenValidityDuration !== undefined && (typeof passwordPolicy.resetTokenValidityDuration !== 'number' || passwordPolicy.resetTokenValidityDuration <= 0)) {
        throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
      }

      if (passwordPolicy.validatorPattern) {
        if (typeof passwordPolicy.validatorPattern === 'string') {
          passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
        } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
          throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
        }
      }

      if (passwordPolicy.validatorCallback && typeof passwordPolicy.validatorCallback !== 'function') {
        throw 'passwordPolicy.validatorCallback must be a function.';
      }

      if (passwordPolicy.doNotAllowUsername && typeof passwordPolicy.doNotAllowUsername !== 'boolean') {
        throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
      }

      if (passwordPolicy.maxPasswordHistory && (!Number.isInteger(passwordPolicy.maxPasswordHistory) || passwordPolicy.maxPasswordHistory <= 0 || passwordPolicy.maxPasswordHistory > 20)) {
        throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
      }

      if (passwordPolicy.resetTokenReuseIfValid && typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean') {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }

      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }
    }
  } // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern


  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
    }
  }

  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    if (!emailAdapter) {
      throw 'An emailAdapter is required for e-mail verification and password resets.';
    }

    if (typeof appName !== 'string') {
      throw 'An app name is required for e-mail verification and password resets.';
    }

    if (typeof publicServerURL !== 'string') {
      throw 'A public server url is required for e-mail verification and password resets.';
    }

    if (emailVerifyTokenValidityDuration) {
      if (isNaN(emailVerifyTokenValidityDuration)) {
        throw 'Email verify token validity duration must be a valid number.';
      } else if (emailVerifyTokenValidityDuration <= 0) {
        throw 'Email verify token validity duration must be a value greater than 0.';
      }
    }

    if (emailVerifyTokenReuseIfValid && typeof emailVerifyTokenReuseIfValid !== 'boolean') {
      throw 'emailVerifyTokenReuseIfValid must be a boolean value';
    }

    if (emailVerifyTokenReuseIfValid && !emailVerifyTokenValidityDuration) {
      throw 'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration';
    }
  }

  static validateFileUploadOptions(fileUpload) {
    try {
      if (fileUpload == null || typeof fileUpload !== 'object' || fileUpload instanceof Array) {
        throw 'fileUpload must be an object value.';
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        return;
      }

      throw e;
    }

    if (fileUpload.enableForAnonymousUser === undefined) {
      fileUpload.enableForAnonymousUser = _Definitions.FileUploadOptions.enableForAnonymousUser.default;
    } else if (typeof fileUpload.enableForAnonymousUser !== 'boolean') {
      throw 'fileUpload.enableForAnonymousUser must be a boolean value.';
    }

    if (fileUpload.enableForPublic === undefined) {
      fileUpload.enableForPublic = _Definitions.FileUploadOptions.enableForPublic.default;
    } else if (typeof fileUpload.enableForPublic !== 'boolean') {
      throw 'fileUpload.enableForPublic must be a boolean value.';
    }

    if (fileUpload.enableForAuthenticatedUser === undefined) {
      fileUpload.enableForAuthenticatedUser = _Definitions.FileUploadOptions.enableForAuthenticatedUser.default;
    } else if (typeof fileUpload.enableForAuthenticatedUser !== 'boolean') {
      throw 'fileUpload.enableForAuthenticatedUser must be a boolean value.';
    }
  }

  static validateMasterKeyIps(masterKeyIps) {
    for (const ip of masterKeyIps) {
      if (!_net.default.isIP(ip)) {
        throw `Invalid ip in masterKeyIps: ${ip}`;
      }
    }
  }

  get mount() {
    var mount = this._mount;

    if (this.publicServerURL) {
      mount = this.publicServerURL;
    }

    return mount;
  }

  set mount(newValue) {
    this._mount = newValue;
  }

  static validateSessionConfiguration(sessionLength, expireInactiveSessions) {
    if (expireInactiveSessions) {
      if (isNaN(sessionLength)) {
        throw 'Session length must be a valid number.';
      } else if (sessionLength <= 0) {
        throw 'Session length must be a value greater than 0.';
      }
    }
  }

  static validateMaxLimit(maxLimit) {
    if (maxLimit <= 0) {
      throw 'Max limit must be a value greater than 0.';
    }
  }

  static validateAllowHeaders(allowHeaders) {
    if (![null, undefined].includes(allowHeaders)) {
      if (Array.isArray(allowHeaders)) {
        allowHeaders.forEach(header => {
          if (typeof header !== 'string') {
            throw 'Allow headers must only contain strings';
          } else if (!header.trim().length) {
            throw 'Allow headers must not contain empty strings';
          }
        });
      } else {
        throw 'Allow headers must be an array';
      }
    }
  }

  generateEmailVerifyTokenExpiresAt() {
    if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
      return undefined;
    }

    var now = new Date();
    return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
  }

  generatePasswordResetTokenExpiresAt() {
    if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
      return undefined;
    }

    const now = new Date();
    return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
  }

  generateSessionExpiresAt() {
    if (!this.expireInactiveSessions) {
      return undefined;
    }

    var now = new Date();
    return new Date(now.getTime() + this.sessionLength * 1000);
  }

  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }

  get invalidVerificationLinkURL() {
    return this.customPages.invalidVerificationLink || `${this.publicServerURL}/apps/invalid_verification_link.html`;
  }

  get linkSendSuccessURL() {
    return this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`;
  }

  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }

  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }

  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }

  get requestResetPasswordURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }

  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }

  get parseFrameURL() {
    return this.customPages.parseFrameURL;
  }

  get verifyEmailURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/verify_email`;
  } // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.


  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }

}

exports.Config = Config;
var _default = Config;
exports.default = _default;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Db25maWcuanMiXSwibmFtZXMiOlsicmVtb3ZlVHJhaWxpbmdTbGFzaCIsInN0ciIsImVuZHNXaXRoIiwic3Vic3RyIiwibGVuZ3RoIiwiQ29uZmlnIiwiZ2V0IiwiYXBwbGljYXRpb25JZCIsIm1vdW50IiwiY2FjaGVJbmZvIiwiQXBwQ2FjaGUiLCJjb25maWciLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImtleSIsInNjaGVtYUNhY2hlIiwiU2NoZW1hQ2FjaGUiLCJjYWNoZUNvbnRyb2xsZXIiLCJzY2hlbWFDYWNoZVRUTCIsImVuYWJsZVNpbmdsZVNjaGVtYUNhY2hlIiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZSIsImFwcElkIiwic2V0dXBQYXNzd29yZFZhbGlkYXRvciIsInBhc3N3b3JkUG9saWN5IiwidmVyaWZ5VXNlckVtYWlscyIsInVzZXJDb250cm9sbGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJleHBpcmVJbmFjdGl2ZVNlc3Npb25zIiwic2Vzc2lvbkxlbmd0aCIsIm1heExpbWl0IiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJhY2NvdW50TG9ja291dCIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleSIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImZpbGVVcGxvYWQiLCJwYWdlcyIsIkVycm9yIiwiZW1haWxBZGFwdGVyIiwidmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5IiwidmFsaWRhdGVQYXNzd29yZFBvbGljeSIsInZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMiLCJzdGFydHNXaXRoIiwidmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlTWFzdGVyS2V5SXBzIiwidmFsaWRhdGVNYXhMaW1pdCIsInZhbGlkYXRlQWxsb3dIZWFkZXJzIiwidmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMiLCJ2YWxpZGF0ZVBhZ2VzT3B0aW9ucyIsInByb3RvdHlwZSIsInRvU3RyaW5nIiwiY2FsbCIsImVuYWJsZVJvdXRlciIsInVuZGVmaW5lZCIsIlBhZ2VzT3B0aW9ucyIsImRlZmF1bHQiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwiQXJyYXkiLCJ0dGwiLCJJZGVtcG90ZW5jeU9wdGlvbnMiLCJpc05hTiIsInBhdGhzIiwiZHVyYXRpb24iLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJ0aHJlc2hvbGQiLCJ1bmxvY2tPblBhc3N3b3JkUmVzZXQiLCJBY2NvdW50TG9ja291dE9wdGlvbnMiLCJtYXhQYXNzd29yZEFnZSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwidmFsaWRhdG9yUGF0dGVybiIsIlJlZ0V4cCIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWx1ZSIsInRlc3QiLCJlIiwiUmVmZXJlbmNlRXJyb3IiLCJlbmFibGVGb3JBbm9ueW1vdXNVc2VyIiwiRmlsZVVwbG9hZE9wdGlvbnMiLCJlbmFibGVGb3JQdWJsaWMiLCJlbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciIsImlwIiwibmV0IiwiaXNJUCIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiaW5jbHVkZXMiLCJpc0FycmF5IiwiaGVhZGVyIiwidHJpbSIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCJpbnZhbGlkTGlua1VSTCIsImN1c3RvbVBhZ2VzIiwiaW52YWxpZExpbmsiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCIsImludmFsaWRWZXJpZmljYXRpb25MaW5rIiwibGlua1NlbmRTdWNjZXNzVVJMIiwibGlua1NlbmRTdWNjZXNzIiwibGlua1NlbmRGYWlsVVJMIiwibGlua1NlbmRGYWlsIiwidmVyaWZ5RW1haWxTdWNjZXNzVVJMIiwidmVyaWZ5RW1haWxTdWNjZXNzIiwiY2hvb3NlUGFzc3dvcmRVUkwiLCJjaG9vc2VQYXNzd29yZCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2VzcyIsInBhcnNlRnJhbWVVUkwiLCJ2ZXJpZnlFbWFpbFVSTCIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFJQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFNQTs7OztBQWRBO0FBQ0E7QUFDQTtBQWNBLFNBQVNBLG1CQUFULENBQTZCQyxHQUE3QixFQUFrQztBQUNoQyxNQUFJLENBQUNBLEdBQUwsRUFBVTtBQUNSLFdBQU9BLEdBQVA7QUFDRDs7QUFDRCxNQUFJQSxHQUFHLENBQUNDLFFBQUosQ0FBYSxHQUFiLENBQUosRUFBdUI7QUFDckJELElBQUFBLEdBQUcsR0FBR0EsR0FBRyxDQUFDRSxNQUFKLENBQVcsQ0FBWCxFQUFjRixHQUFHLENBQUNHLE1BQUosR0FBYSxDQUEzQixDQUFOO0FBQ0Q7O0FBQ0QsU0FBT0gsR0FBUDtBQUNEOztBQUVNLE1BQU1JLE1B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aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQge1xuICBJZGVtcG90ZW5jeU9wdGlvbnMsXG4gIEZpbGVVcGxvYWRPcHRpb25zLFxuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIFBhZ2VzT3B0aW9ucyxcbn0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuXG5mdW5jdGlvbiByZW1vdmVUcmFpbGluZ1NsYXNoKHN0cikge1xuICBpZiAoIXN0cikge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbiAgaWYgKHN0ci5lbmRzV2l0aCgnLycpKSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cigwLCBzdHIubGVuZ3RoIC0gMSk7XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZyB7XG4gIHN0YXRpYyBnZXQoYXBwbGljYXRpb25JZDogc3RyaW5nLCBtb3VudDogc3RyaW5nKSB7XG4gICAgY29uc3QgY2FjaGVJbmZvID0gQXBwQ2FjaGUuZ2V0KGFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghY2FjaGVJbmZvKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWcoKTtcbiAgICBjb25maWcuYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgT2JqZWN0LmtleXMoY2FjaGVJbmZvKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09ICdkYXRhYmFzZUNvbnRyb2xsZXInKSB7XG4gICAgICAgIGNvbnN0IHNjaGVtYUNhY2hlID0gbmV3IFNjaGVtYUNhY2hlKFxuICAgICAgICAgIGNhY2hlSW5mby5jYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgICAgY2FjaGVJbmZvLnNjaGVtYUNhY2hlVFRMLFxuICAgICAgICAgIGNhY2hlSW5mby5lbmFibGVTaW5nbGVTY2hlbWFDYWNoZVxuICAgICAgICApO1xuICAgICAgICBjb25maWcuZGF0YWJhc2UgPSBuZXcgRGF0YWJhc2VDb250cm9sbGVyKGNhY2hlSW5mby5kYXRhYmFzZUNvbnRyb2xsZXIuYWRhcHRlciwgc2NoZW1hQ2FjaGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnW2tleV0gPSBjYWNoZUluZm9ba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZShzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBBcHBDYWNoZS5wdXQoc2VydmVyQ29uZmlndXJhdGlvbi5hcHBJZCwgc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnNldHVwUGFzc3dvcmRWYWxpZGF0b3Ioc2VydmVyQ29uZmlndXJhdGlvbi5wYXNzd29yZFBvbGljeSk7XG4gICAgcmV0dXJuIHNlcnZlckNvbmZpZ3VyYXRpb247XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGUoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCxcbiAgICBleHBpcmVJbmFjdGl2ZVNlc3Npb25zLFxuICAgIHNlc3Npb25MZW5ndGgsXG4gICAgbWF4TGltaXQsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgfSkge1xuICAgIGlmIChtYXN0ZXJLZXkgPT09IHJlYWRPbmx5TWFzdGVyS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgcmVhZE9ubHlNYXN0ZXJLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIGNvbnN0IGVtYWlsQWRhcHRlciA9IHVzZXJDb250cm9sbGVyLmFkYXB0ZXI7XG4gICAgaWYgKHZlcmlmeVVzZXJFbWFpbHMpIHtcbiAgICAgIHRoaXMudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWUsXG4gICAgICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLnZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3koYWNjb3VudExvY2tvdXQpO1xuICAgIHRoaXMudmFsaWRhdGVQYXNzd29yZFBvbGljeShwYXNzd29yZFBvbGljeSk7XG4gICAgdGhpcy52YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zKGZpbGVVcGxvYWQpO1xuXG4gICAgaWYgKHR5cGVvZiByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0ICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG5cbiAgICBpZiAocHVibGljU2VydmVyVVJMKSB7XG4gICAgICBpZiAoIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwOi8vJykgJiYgIXB1YmxpY1NlcnZlclVSTC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICAgIHRocm93ICdwdWJsaWNTZXJ2ZXJVUkwgc2hvdWxkIGJlIGEgdmFsaWQgSFRUUFMgVVJMIHN0YXJ0aW5nIHdpdGggaHR0cHM6Ly8nO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLnZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZU1hc3RlcktleUlwcyhtYXN0ZXJLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpO1xuICAgIHRoaXMudmFsaWRhdGVJZGVtcG90ZW5jeU9wdGlvbnMoaWRlbXBvdGVuY3lPcHRpb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlUGFnZXNPcHRpb25zKHBhZ2VzKTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcykge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZVJvdXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXIgPSBQYWdlc09wdGlvbnMuZW5hYmxlUm91dGVyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZVJvdXRlcikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZVJvdXRlciBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9IFBhZ2VzT3B0aW9ucy5lbmFibGVMb2NhbGl6YXRpb24uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25Kc29uUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBsYWNlaG9sZGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wbGFjZWhvbGRlcnMgPSBQYWdlc09wdGlvbnMucGxhY2Vob2xkZXJzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5wbGFjZWhvbGRlcnMpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgdHlwZW9mIHBhZ2VzLnBsYWNlaG9sZGVycyAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGxhY2Vob2xkZXJzIG11c3QgYmUgYW4gb2JqZWN0IG9yIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmZvcmNlUmVkaXJlY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZm9yY2VSZWRpcmVjdCA9IFBhZ2VzT3B0aW9ucy5mb3JjZVJlZGlyZWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmZvcmNlUmVkaXJlY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5mb3JjZVJlZGlyZWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc1BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNQYXRoID0gUGFnZXNPcHRpb25zLnBhZ2VzUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc0VuZHBvaW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPSBQYWdlc09wdGlvbnMucGFnZXNFbmRwb2ludC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzRW5kcG9pbnQpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc0VuZHBvaW50IG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVVybHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tVXJscyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21VcmxzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMuY3VzdG9tVXJscykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21VcmxzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21Sb3V0ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tUm91dGVzID0gUGFnZXNPcHRpb25zLmN1c3RvbVJvdXRlcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShwYWdlcy5jdXN0b21Sb3V0ZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVJvdXRlcyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpZGVtcG90ZW5jeU9wdGlvbnMudHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPSBJZGVtcG90ZW5jeU9wdGlvbnMudHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkgJiYgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA8PSAwKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAgc2Vjb25kcyc7XG4gICAgfSBlbHNlIGlmIChpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyA9IElkZW1wb3RlbmN5T3B0aW9ucy5wYXRocy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBwYXRocyBtdXN0IGJlIG9mIGFuIGFycmF5IG9mIHN0cmluZ3MnO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KSB7XG4gICAgaWYgKGFjY291bnRMb2Nrb3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBhY2NvdW50TG9ja291dC5kdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPD0gMCB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA+IDk5OTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCBkdXJhdGlvbiBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICFOdW1iZXIuaXNJbnRlZ2VyKGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCkgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkIDwgMSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPiA5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IHRocmVzaG9sZCBzaG91bGQgYmUgYW4gaW50ZWdlciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID0gQWNjb3VudExvY2tvdXRPcHRpb25zLnVubG9ja09uUGFzc3dvcmRSZXNldC5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmICghaXNCb29sZWFuKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSAnbnVtYmVyJyB8fCBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSA8IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPSBuZXcgUmVnRXhwKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pO1xuICAgICAgICB9IGVsc2UgaWYgKCEocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBtdXN0IGJlIGEgcmVnZXggc3RyaW5nIG9yIFJlZ0V4cCBvYmplY3QuJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAmJlxuICAgICAgICAoIU51bWJlci5pc0ludGVnZXIocGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA8PSAwIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ID4gMjApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSBtdXN0IGJlIGFuIGludGVnZXIgcmFuZ2luZyAwIC0gMjAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmICFwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgcmVzZXRUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IHJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpcyBjb25maWd1cmVkIHRoZW4gc2V0dXAgYSBjYWxsYmFjayB0byBwcm9jZXNzIHRoZSBwYXR0ZXJuXG4gIHN0YXRpYyBzZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5ICYmIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgIHBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgPSB2YWx1ZSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuLnRlc3QodmFsdWUpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgIGVtYWlsQWRhcHRlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICB9KSB7XG4gICAgaWYgKCFlbWFpbEFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdBbiBlbWFpbEFkYXB0ZXIgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGFwcE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQW4gYXBwIG5hbWUgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHB1YmxpY1NlcnZlclVSTCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93ICdBIHB1YmxpYyBzZXJ2ZXIgdXJsIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBpZiAoaXNOYU4oZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmIHR5cGVvZiBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgIWVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChmaWxlVXBsb2FkID09IG51bGwgfHwgdHlwZW9mIGZpbGVVcGxvYWQgIT09ICdvYmplY3QnIHx8IGZpbGVVcGxvYWQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICB0aHJvdyAnZmlsZVVwbG9hZCBtdXN0IGJlIGFuIG9iamVjdCB2YWx1ZS4nO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgUmVmZXJlbmNlRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBbm9ueW1vdXNVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yUHVibGljLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXN0ZXJLZXlJcHMobWFzdGVyS2V5SXBzKSB7XG4gICAgZm9yIChjb25zdCBpcCBvZiBtYXN0ZXJLZXlJcHMpIHtcbiAgICAgIGlmICghbmV0LmlzSVAoaXApKSB7XG4gICAgICAgIHRocm93IGBJbnZhbGlkIGlwIGluIG1hc3RlcktleUlwczogJHtpcH1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBtb3VudCgpIHtcbiAgICB2YXIgbW91bnQgPSB0aGlzLl9tb3VudDtcbiAgICBpZiAodGhpcy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIG1vdW50ID0gdGhpcy5wdWJsaWNTZXJ2ZXJVUkw7XG4gICAgfVxuICAgIHJldHVybiBtb3VudDtcbiAgfVxuXG4gIHNldCBtb3VudChuZXdWYWx1ZSkge1xuICAgIHRoaXMuX21vdW50ID0gbmV3VmFsdWU7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgaWYgKGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIGlmIChpc05hTihzZXNzaW9uTGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChzZXNzaW9uTGVuZ3RoIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KSB7XG4gICAgaWYgKG1heExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdNYXggbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycykge1xuICAgIGlmICghW251bGwsIHVuZGVmaW5lZF0uaW5jbHVkZXMoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgICBhbGxvd0hlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xuICAgICAgICAgIGlmICh0eXBlb2YgaGVhZGVyICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBvbmx5IGNvbnRhaW4gc3RyaW5ncyc7XG4gICAgICAgICAgfSBlbHNlIGlmICghaGVhZGVyLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgbm90IGNvbnRhaW4gZW1wdHkgc3RyaW5ncyc7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3QgYmUgYW4gYXJyYXknO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl19
// Build-time constants defined in scripts/build.mts
declare global {
  var PACKAGE_VERSION: string | undefined;
  var PACKAGE_NAME: string | undefined;
  var GIT_COMMIT_SHA: string | undefined;
  var GIT_REPOSITORY_URL: string | undefined;
}

export {};

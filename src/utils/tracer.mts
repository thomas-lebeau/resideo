import tracer from "dd-trace";

/**
 * These variables are defined at build time in scripts/build.mjs
 * If they are not defined, we are running the code from the local dev env, so we don't need to initialize the tracer
 */
if (PACKAGE_NAME && PACKAGE_VERSION && GIT_COMMIT_SHA && GIT_REPOSITORY_URL) {
  tracer.init({
    service: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    tags: [
      `git.commit.sha:${GIT_COMMIT_SHA}`,
      `git.repository_url:${GIT_REPOSITORY_URL}`,
    ],
  });
}

export default tracer;

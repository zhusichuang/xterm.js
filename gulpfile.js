/**
 * @license MIT
 */

const browserify = require('browserify');
const buffer = require('vinyl-buffer');
const coveralls = require('gulp-coveralls');
const fs = require('fs-extra');
const gulp = require('gulp');
const path = require('path');
const istanbul = require('gulp-istanbul');
const merge = require('merge-stream');
const mocha = require('gulp-mocha');
const sorcery = require('sorcery');
const source = require('vinyl-source-stream');
const sourcemaps = require('gulp-sourcemaps');
const ts = require('gulp-typescript');
const util = require('gulp-util');
const webpack = require('webpack-stream');

const buildDir = process.env.BUILD_DIR || 'build';
const tsProject = ts.createProject('tsconfig.json');
let outDir = tsProject.config.compilerOptions.outDir;

const addons = fs.readdirSync(`${__dirname}/src/addons`);

// Under some environments like TravisCI, this comes out at absolute which can
// break the build. This ensures that the outDir is absolute.
if (path.normalize(outDir).indexOf(__dirname) !== 0) {
  outDir = `${__dirname}/${path.normalize(outDir)}`;
}

/**
 * Bundle JavaScript files produced by the `tsc` task, into a single file named `xterm.js` with
 * Browserify.
 */
gulp.task('browserify', [], function() {
  // Ensure that the build directory exists
  fs.ensureDirSync(buildDir);

  let browserifyOptions = {
    basedir: buildDir,
    debug: true,
    entries: [`${outDir}/xterm.js`],
    standalone: 'Terminal',
    cache: {},
    packageCache: {}
  };
  let bundleStream = browserify(browserifyOptions)
        .bundle()
        .pipe(source('xterm.js'))
        .pipe(buffer())
        .pipe(sourcemaps.init({loadMaps: true, sourceRoot: '..'}))
        .pipe(sourcemaps.write('./'))
        .pipe(gulp.dest(buildDir));

  // Copy stylesheets from ${outDir}/ to ${buildDir}/
  let copyStylesheets = gulp.src(`${outDir}/**/*.css`).pipe(gulp.dest(buildDir));

  return merge(bundleStream, copyStylesheets);
});

gulp.task('browserify-addons', [], function() {
  const bundles = addons.map((addon) => {
    const addonOptions = {
      basedir: `${buildDir}/addons/${addon}`,
      debug: true,
      entries: [`${outDir}/addons/${addon}/${addon}.js`],
      standalone: addon,
      cache: {},
      packageCache: {}
    };

    const addonBundle = browserify(addonOptions)
      .external(path.join(outDir, 'Terminal.js'))
      .bundle()
      .pipe(source(`./addons/${addon}/${addon}.js`))
      .pipe(buffer())
      .pipe(sourcemaps.init({loadMaps: true, sourceRoot: ''}))
      .pipe(sourcemaps.write('./'))
      .pipe(gulp.dest(buildDir));

    return addonBundle;
  });

  return merge(...bundles);
});

gulp.task('instrument-test', function () {
  return gulp.src([`${outDir}/**/*.js`])
    // Covering files
    .pipe(istanbul())
    // Force `require` to return covered files
    .pipe(istanbul.hookRequire());
});

gulp.task('mocha', ['instrument-test'], function () {
  return gulp.src([
    `${outDir}/*test.js`,
    `${outDir}/**/*test.js`,
    `${outDir}/*integration.js`,
    `${outDir}/**/*integration.js`
  ], {read: false})
      .pipe(mocha())
      .once('error', () => process.exit(1))
      .pipe(istanbul.writeReports());
});

/**
 * Run single test file by file name(without file extension). Example of the command:
 * gulp mocha-test --test InputHandler.test
 */
gulp.task('mocha-test', ['instrument-test'], function () {
  let testName = util.env.test;
  util.log("Run test by Name: " + testName);
  return gulp.src([`${outDir}/${testName}.js`, `${outDir}/**/${testName}.js`], {read: false})
         .pipe(mocha())
         .once('error', () => process.exit(1))
         .pipe(istanbul.writeReports());
});

/**
 * Use `sorcery` to resolve the source map chain and point back to the TypeScript files.
 * (Without this task the source maps produced for the JavaScript bundle points into the
 * compiled JavaScript files in ${outDir}/).
 */
gulp.task('sorcery', ['browserify'], function () {
  let chain = sorcery.loadSync(`${buildDir}/xterm.js`);
  chain.apply();
  chain.writeSync();
});

gulp.task('sorcery-addons', ['browserify-addons'], function () {
  addons.forEach((addon) => {
    const chain = sorcery.loadSync(`${buildDir}/addons/${addon}/${addon}.js`);
    chain.apply();
    chain.writeSync();
  })
});

gulp.task('webpack', ['build'], function() {
  return gulp.src('demo/main.js')
    .pipe(webpack(require('./webpack.config.js')))
    .pipe(gulp.dest('demo/dist/'));
});


gulp.task('watch-demo', ['webpack'], () => {
  gulp.watch(['./demo/*', './lib/**/*'], ['webpack']);
});

/**
 * Submit coverage results to coveralls.io
 */
gulp.task('coveralls', function () {
  gulp.src('coverage/**/lcov.info')
    .pipe(coveralls());
});

gulp.task('build', ['sorcery', 'sorcery-addons']);
gulp.task('test', ['mocha']);
gulp.task('default', ['build']);

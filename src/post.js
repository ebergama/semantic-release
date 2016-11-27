var url = require('url')
var execSync = require('child_process').execSync
var request = require('request');

var gitHead = require('git-head')
var GitHubApi = require('github')
var parseSlug = require('@bahmutov/parse-github-repo-url')

module.exports = function (config, cb) {
  var pkg = config.pkg
  var options = config.options
  var plugins = config.plugins
  var ghConfig = options.githubUrl ? url.parse(options.githubUrl) : {}

  var github = new GitHubApi({
    version: '3.0.0',
    port: ghConfig.port,
    protocol: (ghConfig.protocol || '').split(':')[0] || null,
    host: ghConfig.hostname,
    pathPrefix: options.githubApiPathPrefix || null,
    debug:true
  })

  plugins.generateNotes(config, function (err, log) {
    if (err) return cb(err)

    gitHead(function (err, hash) {
      if (err) return cb(err)

      var ghRepo = parseSlug(pkg.repository.url)
      var release = {
        owner: ghRepo[0],
        repo: ghRepo[1],
        name: 'v' + pkg.version,
        tag_name: 'v' + pkg.version,
        target_commitish: hash,
        draft: !!options.debug,
        body: log
      }

      if (options.debug && !options.githubToken) {
        return cb(null, false, release)
      }

      github.authenticate({
        type: 'oauth',
        token: options.githubToken
      })

      // with node-github the release api es returning a redirect and the package does not handle it even it's valid
      // in Github.com
      request.post({
        headers: {'content-type' : 'application/json'},
        url: 'https://' + ghConfig.hostname + '/api/v3/repos/' + release.owner + '/' + release.repo + '/releases?access_token=' + options.githubToken,
        json: release
      }, function (error, response, body) {
        if (error) console.log(error);
        console.log(response.statusCode);
        if (!error && response.statusCode == 200) {
          if (!error) {
            console.log('Release has been made, status code is ' + response.statusCode);
            cb(null, true, release)
          }
          cb(error);
        }
      })
    })
  })

  // tag the last commit with a new version accordingly to the release made.
  execSync('git tag v' + pkg.version);
  // push the tags
  execSync('git push --tags')
  // add the package.json to the index and commit with a version name like npm version does
  execSync('git add package.json')
  execSync('git commit -m \'' + pkg.version + '\'')
  execSync('git push')

}

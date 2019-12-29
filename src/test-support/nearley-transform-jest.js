const {execSync} = require('child_process')

module.exports = {
    process(src, file) { return execSync(`nearleyc ${file}`).toString('utf8') }
}
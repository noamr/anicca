const yargs = require('yargs')
import {build} from './src/builder/index'
const files = yargs.parse()._

Promise.all(files.map((inputPath: string) => {
    build({inputPath})
}))

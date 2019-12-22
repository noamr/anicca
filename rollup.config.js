import {terser} from 'rollup-plugin-terser'
import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import serve from 'rollup-plugin-serve'

const production = process.env.BUILD === 'production'

export default {
	input: 'src/main.js',
	output: {
		file: 'public/bundle.js',
		format: 'esm',
		sourcemap: true
	},
	plugins: [
        resolve(),
        commonjs(),
        dev && serve('/public'),
		production && terser() // minify, but only in production
	]
}
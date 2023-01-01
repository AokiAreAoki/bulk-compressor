const log = console.log
const fs = require( 'fs' )
const cp = require( 'child_process' )
const YAML = require( 'yaml' )
const { join } = require( 'path' )

String.prototype.matchFirst = function( re, cb ){
    let matched = this.match( re )

    if( matched )
        matched = matched[1] ?? matched[0]

    if( matched && typeof cb === 'function' )
        cb( matched )

    return matched
}

function renameAsync( oldPath, newPath ){
	return new Promise( ( resolve, reject ) => {
		fs.rename( oldPath, newPath, err => {
			if( err )
				reject( err )
			else
				resolve()
		})
	})
}

function utimesAsync( path, atime, mtime ){
	return new Promise( ( resolve, reject ) => {
		fs.utimes( path, atime, mtime, err => {
			if( err )
				reject( err )
			else
				resolve()
		})
	})
}

function isNiceName( filename ){
	return /[^\.\/\\]\.\w+$/.test( filename )
}

function getExtension( filename ){
	let start = filename.length

	while( --start >= 0 ){
		if( filename[start] === '.' )
			return filename.substring( ++start ).toLowerCase()
	}

	return null
}

function prettySize( size ){
	let units = [
		'B',
		'KB',
		'MB',
		'GB',
		'TB',
	]
	let u = Math.floor( Math.log( size ) / Math.log( 1024 ) )
	u = u < units.length ? u : units.length
	let unit = units[u]

	size /= 1024 ** u
	return size.toFixed(2) + ' ' + unit
}

const extensionsPath = join( __dirname, 'extensions.yml' )
let extensions = null

if( fs.existsSync( extensionsPath ) ){
	extensions = YAML.parse(
		fs.readFileSync( extensionsPath, 'utf-8' )
	)
} else {
	fs.writeFileSync( extensionsPath, '' )
}

if( !extensions || Object.keys( extensions ) === 0 ){
	extensions = YAML.parse(
		fs.readFileSync( join( __dirname, 'default-extensions.yml' ), 'utf-8' )
	)
}

let files = process.argv.slice(2).map( path => path.replace( /\\/g, '/' ) )
const successedFiles = []
const unaccessedFiles = []
const errors = []
const MAX_CP = 5
let cpsInWork = []

let totalSizeBefore = 0, totalSizeAfter = 0
let justInCaseInterval
let progressDisplayInterval

console.clear()
log( `Validating files existence...` )
log()

class File {
	static access = fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK
	static new( path ){
		return path instanceof File
			? path
			: new File( path )
	}

	constructor( path ){
		this.path = path
		this.ext = getExtension( path )

		try {
			fs.accessSync( this.path, File.access )
			this.updateStat()
		} catch( err ){
			this.unaccessable = true
			return
		}

		if( this.stat.isDirectory() )
			this.isDir = true
	}

	updateStat(){
		this.stat = fs.statSync( this.path )
	}

	async renameAsync( newPath ){
		await renameAsync( this.path, newPath )
		this.path = newPath
	}
}

{ // Fetching files
	let rflag = false
	const onlyFiles = []

	for( let i = 0; i < files.length; ++i ){
		const path = files[i]

		if( typeof path === 'string' && path.toLowerCase() === '-r' ){
			rflag = true
			continue
		}

		const file = File.new( path )

		if( !file.isDir && !isNiceName( file.path ) )
			continue

		if( file.unaccessable ){
			unaccessedFiles.push( file )
			continue
		}

		if( file.isDir ){
			let content = fs.readdirSync( file.path )
				.map( subfile => File.new( join( file.path, subfile ) ) )

			if( rflag )
				content.forEach( dir => {
					if( dir.isDir )
						files.push( '-r' )

					files.push( dir )
				})
			else
				files.push( ...content.filter( file => fs.statSync( file.path ).isFile() ) )
		} else if( file.ext && extensions[file.ext] ){
			onlyFiles.push( file )
			totalSizeBefore += file.stat.size
			log( `- ${file.path}` )
		}

		if( rflag )
			rflag = false
	}

	files = onlyFiles
}

log()
log( `done` )

const amount = files.length
justInCaseInterval = setInterval( nextFile, 1337 )

let oldText = ''
progressDisplayInterval = setInterval( () => {
	let text = [
		`Files processed: ${successedFiles.length}/${amount}`,
	]

	if( unaccessedFiles.length !== 0 )
		text.push( `Files unable to access: ${unaccessedFiles.length}\n` )

	if( errors.length !== 0 ){
		text.push( `Errors: ${errors.length}\n` )

		const err = errors[errors.length - 1]
		text.push( 'Last errored file: ' + err.file.path )
		text.push( 'Error: ' + err.error )
	} else
		text.push( 'No errors' )

	const cpLogs = cpsInWork
		.map( cp => cp._stdout.match( /([^\n]+)$/ )?.[1] )
		.filter( line => !!line )
		.map( ( lastLine, i ) => `cp #${i + 1}:\n${lastLine || 'no output yet'}` )

	if( cpLogs.length !== 0 ){
		text.push( '\nLog:' )
		text.push( ...cpLogs )
	}

	text = text.join( '\n' )

	if( oldText !== text ){
		oldText = text
		console.clear()
		log( text )
	}
}, 1000 / 5 )

const INPUT_RE = /INPUT/
const INPUT_REG = /INPUT/g
const OUTPUT_RE = /OUTPUT(\.\w+)?/
const OUTPUT_REG = /OUTPUT(\.\w+)?/g

function nextFile(){
	if( cpsInWork.length >= MAX_CP )
		return

	let file = files.shift()

	if( !file ){
		if( cpsInWork.length <= 0 )
			finish()

		return
	}

	const profile = extensions[file.ext]
	let outputPath = file.path
	let cmd = profile.cmd
	const newExt = cmd.matchFirst( OUTPUT_RE )

	outputPath = outputPath.substring( 0, outputPath.length - newExt.length ) + newExt
	const tempPath = outputPath.replace( /([^\/\\]+$)/, 'compressed_$1' )

	cmd = cmd.replace( INPUT_REG, `"${file.path}"` )
	cmd = cmd.replace( OUTPUT_REG, `"${tempPath}"` )

	// console.log( cmd )
	// process.exit()

	const ffmpeg = cp.exec( cmd )
	cpsInWork.push( ffmpeg )

	ffmpeg._stdout = ''
	ffmpeg.stderr.on( 'data', chunk => {
		ffmpeg._stdout += chunk.toString()
	})

	let stderr = ''
	ffmpeg.stderr.on( 'data', chunk => {
		stderr += chunk.toString()
	})

	ffmpeg.once( 'exit', async code => {
		if( code !== 0 )
			return errors.push({ file, error: stderr || 'empty stderr :(' })

		const tempSize = fs.statSync( tempPath ).size

		if( profile.ilcf && tempSize / file.stat.size > .90 ){
			fs.unlinkSync( tempPath )
			successedFiles.push( file )
			totalSizeAfter += file.stat.size
		} else
			await utimesAsync( tempPath, file.stat.atime, file.stat.mtime )
				.then( () => renameAsync( tempPath, outputPath ) )
				.then( () => {
					successedFiles.push( file )
					file.updateStat()
					totalSizeAfter += file.stat.size
				})
				.catch( error => errors.push({ file, error }) )

		cpsInWork = cpsInWork.filter( cp => cp !== ffmpeg )
		setTimeout( nextFile, 123 * cpsInWork.length )
	})

	setTimeout( nextFile, 45 * cpsInWork.length )
}

nextFile()

function finish(){
	clearInterval( justInCaseInterval )
	clearInterval( progressDisplayInterval )
	console.clear()

	log( `Files processed succesfully: ${successedFiles.length}/${amount}` )

	if( unaccessedFiles.length !== 0 ){
		log( `Unaccessable files: (${unaccessedFiles.length}):` )
		log( unaccessedFiles.map( f => ` - ${f.path}` ).join( '\n' ) )
		log()
	}

	if( errors.length > 0 ){
		log( `Errors (${errors.length}):` )

		errors.forEach( ( err, i ) => {
			log( `Errored file (${i + 1}/${errors.length}): "${err.file.path}"` )
			log( ` - Error:` )
			log( err.error )
			log()
		})
	} else
		log( 'No errors\n' )

	const afterPercent = totalSizeAfter === totalSizeBefore
		? 0
		: totalSizeAfter / totalSizeBefore * 100

	log( `Total size before: ${prettySize( totalSizeBefore )} (100.00%)` )
	log( `Total size after: ${prettySize( totalSizeAfter )} (${afterPercent.toFixed(2)}%)` )

	if( totalSizeBefore === totalSizeAfter )
		log( `No space have been freed` )
	else
		log( `Space freed: ${prettySize( totalSizeBefore - totalSizeAfter )} (${( 100 - afterPercent ).toFixed(2)}%)` )

	process.exit(0)
}

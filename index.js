
const log = console.log
const fs = require( 'fs' )
const cp = require( 'child_process' )
const { join } = require( 'path' )

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

function utimesAsync( file ){
	return new Promise( ( resolve, reject ) => {
		fs.utimes( file.path, file.stat.atime, file.stat.mtime, err => {
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

function getExtention( filename ){
	let start = filename.length

	while( --start >= 0 ){
		if( filename[start] === '.' )
			return filename.substring( ++start )
	}

	return null
}

let extentions = ['jpg', 'jpeg', 'png']

try {
	extentions = fs.readFileSync( join( __dirname, '.extentions' ) )
		.toString()
		.match( /\w+/g )
} catch(e) {}

let files = process.argv.slice(2).map( path => path.replace( /\\/g, '/' ) )
const unaccessedFiles = []
const errors = []
const MAX_CP = 5
let cpsInWork = []

let successed = 0
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

		try {
			fs.accessSync( this.path, File.access )
			this.stat = fs.statSync( this.path )
		} catch( err ){
			this.unaccessable = true
			return
		}
		
		
		if( this.stat.isDirectory() )
			this.isDir = true
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
		} else {
			const ext = getExtention( file.path )

			if( ext && extentions.includes( ext ) ){
				onlyFiles.push( file )
				log( `- ${file.path}` )
			}
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
		`Files processed: ${successed}/${amount}`,
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

nextFile()

async function nextFile(){
	if( cpsInWork.length >= MAX_CP )
		return

	let file = files.shift()

	if( !file ){
		if( cpsInWork.length <= 0 )
			finish()

		return
	}

	const jpegNot = file.path.match( /\.(jpeg|png)$/i )

	if( jpegNot ){
		const jpegName = file.path.substring( 0, file.path.length - jpegNot[1].length ) + 'jpg'
		
		try {
			await file.renameAsync( jpegName )
		} catch( error ){
			return errors.push({ file, error })
		}
	}

	const tempPath = file.path.replace( /([^\/\\]+$)/, 'compressed_$1' )
	const ffmpeg = cp.exec( `ffmpeg -i "${file.path}" "${tempPath}" -y` )
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

		await renameAsync( tempPath, file.path )
			.then( () => utimesAsync( file )
				.then( () => ++successed )
			)
			.catch( error => errors.push({ file, error }) )

		cpsInWork = cpsInWork.filter( cp => cp !== ffmpeg )
		setTimeout( nextFile, 123 * cpsInWork.length )
	})

	setTimeout( nextFile, 45 * cpsInWork.length )
}

function finish(){
	clearInterval( justInCaseInterval )
	clearInterval( progressDisplayInterval )
	console.clear()

	log( `Files processed succesfully: ${successed}/${amount}` )

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
		log( 'No errors' )

	process.exit(0)
}
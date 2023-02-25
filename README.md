# Bulk Compressor

Bulk Compressor is a simple *in-place* file compressor that uses FFMPEG
* in-place means it compresses files without saving them into new files and even without a change of last modified date.

## Installation
```bash
git clone https://github.com/AokiAreAoki/bulk-compressor.git
cd bulk-compressor
npm i
```

## Usage
General usage:
```bash
cd bulk-compressor
node . [-r] ...<files/directories>
```

## Examples:
```bash
node . <file>
# compresses the <file>

node . <file1> <file2>
# compresses the <file1> and the <file2>

node . <directory>
# compresses all files in the <directory>

node . <file> <directory>
# compresses the <file> and all files in the <directory>

node . -r <directory>
# compresses all files in the <directory> and it's subdirectories

node . <file1> <file2> <directory1> -r <directory2>
# compresses the <file1> and the <file2>
# all files in the <directory1>
# and all files in the <directory2> and it's subdirectories
```

## Configuration:
Put your profiles in `extensions.yml`

if `extensions.yml` doesn't exist - run compressor without args once

`extensions.yml` should have at least 1 profile defined for it to take effect or else the `default-extensions.yml` will be used

### Profile syntax:
```markdown
<extension>:
  cmd: <cmd>
  ilcf: <boolean>
```

- `<extension>` - extension to which a profile should be applied, any regexps/wild cards aren't supported yet
- `<cmd>` - command that should be executed
	* the command isn't restricted to be ffmpeg only
- `<ilcf>` - ignore low compressed files

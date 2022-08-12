# Bulk Compressor 

Bulk Compressor is a simple *in-place* file compressor that uses FFMPEG 
* in-place means it compresses files without saving them into new files and even without a change of last modified date.
## Installation

```bash
git clone https://github.com/AokiAreAoki/bulk-compressor.git
```

## Usage

General usage:
```bash
cd bulk-compressor
node . [-r] ...<files/directories>
```

Examples:
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

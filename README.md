# Bulk Compressor 

Bulk Compressor is a simple *in-place* file compressor that uses FFMPEG 
* in-place means it compresses files without saving them into new files and even without a change of last modified date.
## Installation

```bash
git clone https://github.com/AokiAreAoki/bulk-compressor.git
```

## Usage

```bash
cd bulk-compressor
node . [-r] ...<files/directories>
```
Compresses `<files/directories>`

```bash
node . <file>
```
Compresses the `<file>`

```bash
node . <file1> <file2>
```
Compresses the `<file1>` and the `<file2>`

```bash
node . <directory>
```
Compresses all files in the `<directory>`

```bash
node . <file> <directory>
```
Compresses the `<file>` and all files in the `<directory>`

```bash
node . -r <directory>
```
Compresses all files in the `<directory>` and it's subdirectories 

```bash
node . <file1> <file2> <directory1> -r <directory2>
```
Compresses the `<file1>`, the `<file2>`, all files in the `<directory1>` and all files in the `<directory2>` and it's subdirectories 

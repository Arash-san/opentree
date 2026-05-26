<p align="center">
  <img src="assets/opentree-header.png" alt="OpenTree header" width="100%">
</p>

# OpenTree

OpenTree is an open-source desktop tool for analyzing folders. It scans one or more folders, builds a local index, and turns storage usage into a fast, searchable dark-mode workspace.

## Features

- Multi-folder scans with progress reporting
- Worker-thread indexing with configurable concurrency
- Include and exclude glob filters
- Folder tree, largest files table, extension chart, age chart, and treemap
- Duplicate detection with SHA-256 or MD5 content hashing
- Saved scan indexes and index comparison
- JSON, CSV, XLSX, HTML, and PDF exports
- GitHub release update checks with install-on-download support
- Windows installer builds through Electron Builder

## Development

```powershell
npm install
npm run dev
```

## Tests

```powershell
npm test
```

## Build The Windows Installer

```powershell
npm run dist
```

The installer is written to `release/`.

## Release

Tag a version and push it to GitHub:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The release workflow runs tests, builds the Windows installer, publishes a GitHub release, and provides update metadata for packaged apps.

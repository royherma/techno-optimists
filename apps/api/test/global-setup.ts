export default function () {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 22) {
    throw new Error(
      `techno-optimists API tests require Node 22+, found ${process.version}. Run: nvm use`
    )
  }
}
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const config = {
  transformer: {
    // Custom transformer handles .raw CSV signal files; delegates all other
    // file types to the standard React Native Babel transformer.
    babelTransformerPath: require.resolve('./scripts/rawTransformer'),
  },
  resolver: {
    // Treat .raw as a source module (not an asset) so Metro passes its
    // content to the transformer rather than copying it verbatim.
    sourceExts: [...getDefaultConfig(__dirname).resolver.sourceExts, 'raw'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

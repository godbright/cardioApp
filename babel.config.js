module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Decorators MUST come before class-properties.
    // Use legacy: true (not version: 'legacy') — the form Metro has the
    // longest track record with in the RN + WatermelonDB ecosystem.
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    ['@babel/plugin-proposal-class-properties', { loose: true }],
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: { '@': './src' },
      },
    ],
  ],
};

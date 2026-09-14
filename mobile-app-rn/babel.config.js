module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated's Babel plugin (drives the drawer
    // navigator's animations) rewrites worklets and MUST be listed last
    // -- other plugins running after it can break what it generates.
    plugins: ['react-native-reanimated/plugin'],
  };
};

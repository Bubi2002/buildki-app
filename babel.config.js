module.exports = function (api) {
  api.cache(true);
  let plugins = [];

  plugins.push("./babel-plugins/decode-jsx-unicode-escapes.js");
  plugins.push("react-native-worklets/plugin");

  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins,
  };
};

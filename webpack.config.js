const path = require("path");
const fs = require("fs");
const webpack = require("webpack");

function getConfig(env, argv) {
    let node = env && !!env.node || false;
    let config = {
        mode: "development",
        entry: {
            index: "./index.tsx",
        },
        /*
        externals: [
            function(context, request, callback) {
                if(request === "fs" || request === "jimp") {
                    callback(null, `Object.create(null)`);
                } else {
                    callback();
                }
            }
        ],
        */
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "[name].js",
            //libraryTarget: "assign",
            //library: "module.exports"
        },
        devtool: argv.mode === "production" ? undefined : "inline-source-map",
        resolve: {
            //modules: [path.resolve("./node_modules")],
            extensions: [".ts", ".tsx", ".js", ".cpp"]
        },
        module: {
            rules: [
                { test: /(([^d])|([^.]d)|(^d))\.tsx?$/, loader: "ts-loader", },
                //{ test: /(([^d])|([^.]d)|(^d))\.tsx?$/, loader: `const-calls-loader?mark` },

                { test: /\.less$/, loader: "style-loader!css-loader!less-loader" },

                { test: /\.cpp$/, loader: "cpp-portable-loader" },
            ]
        },
        resolveLoader: {
            modules: ["node_modules", "./loaders"]
        },
        plugins: [
            new webpack.DefinePlugin({
                NODE_CONSTANT: node,
                NODE: node
            })
        ],
    };
    return config;
}

module.exports = getConfig;
# Termux install check

A plain `npm install` on a fresh Termux is not guaranteed to finish without errors.

The reason is native npm modules. They contain C/C++ code that must be compiled for Android/Termux, and prebuilt binaries for normal Linux are not usable there.

Packages that can stop or warn during install:

1. sqlite3 - SQLite database driver, native code. This is the fast primary database, so it is rebuilt during setup. If the build still fails, the bot automatically switches to its built-in JSON database and stays online; see the section below.
2. canvas - image drawing. It is installed as @napi-rs/canvas through a package.json alias, so it uses a prebuilt Android binary and needs no Cairo/Pango compile. Used only by some image commands.
3. sharp - image processing, needs a Termux-compatible backend. The WebAssembly backend is already declared.

bcrypt was replaced with bcryptjs, so password hashing is now pure JavaScript and no longer needs a native build.

canvas and sharp are used only by image commands. The command loader skips a command file that cannot load, so a missing image module will not take the whole bot offline; only those image commands will be unavailable until the module is built.

Other packages in package.json are pure JavaScript and install normally.

What is already prepared for you:

- package.json now accepts Node 20 and newer, so Termux Node 22 will not cause an engine error
- termux-setup.sh installs Node.js, Python, clang, make, pkg-config, Cairo, Pango and the image libraries
- termux-setup.sh first tries a normal install, then falls back to an install without dependency scripts, then verifies the prebuilt canvas and rebuilds sqlite3 if needed
- sharp is kept on the WebAssembly backend, which works on Android

Recommended Termux commands:

  bash termux-setup.sh
  ./start.sh bg

If you want to run npm yourself instead:

  pkg update -y && pkg upgrade -y
  pkg install -y nodejs git python make clang binutils pkg-config cairo pango libjpeg-turbo giflib librsvg libvips
  npm install --omit=dev --no-audit --no-fund

To verify canvas after install:

  node -e "const {createCanvas}=require('canvas'); console.log('canvas OK', createCanvas(10,10).width)"

That should print: canvas OK 10. If it does, image commands such as daily, top and fakechat will render their cards.

If npm install still fails, copy the first real error line that mentions a package name or gyp error and send it. Do not paste cookies or tokens.

If the bot logs "Could not locate the bindings file" for node_sqlite3.node

This means the native sqlite3 addon was not built for your device or Node version. It does not stop the bot any more. The database controller detects it and uses the built-in JSON database instead, so the bot still starts and answers commands.

To repair sqlite3 later, run:

  npm rebuild sqlite3 --build-from-source

Then restart the bot. It will use the SQLite file again as soon as the binding loads. If you never want the automatic JSON fallback, set config.json -> database.fallbackToJson to false, but then a broken sqlite3 build will stop the bot.

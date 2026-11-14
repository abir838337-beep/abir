{ pkgs }: {
  # Node itself comes from `modules` in .replit. These are only build tools
  # (used if sqlite3 has to compile on your Repl).
  deps = [
    pkgs.python3
    pkgs.gnumake
    pkgs.gcc
    pkgs.unzip
  ];
}

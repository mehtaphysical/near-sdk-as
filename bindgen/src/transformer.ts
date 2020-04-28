import { Transform, Parser, Source, Module, Program } from "visitor-as/as";
import { JSONBindingsBuilder, isEntry } from "./JSONBuilder";
import { TypeChecker } from "./typeChecker";
import { posixRelativePath } from './utils';
//@ts-ignore
import * as path from "path";
import { TypesTransformer } from './exportWrapper';


class JSONTransformer extends Transform {
  parser: Parser;
  entryPath: string;
  static isTest: boolean = false;

  afterParse(parser: Parser): void {
    this.parser = parser;
    const writeFile = this.writeFile;
    const baseDir = this.baseDir;

    // Filter for near files
    let files = JSONBindingsBuilder.nearFiles(parser);
    JSONTransformer.isTest = files.map(source => source.normalizedPath).some(path => path.includes("spec"));
    // Visit each file
    files.forEach(source => {
      let writeOut = /\/\/.*@nearfile .*out/.test(source.text);
      if (isEntry(source)) {
        this.entryPath = "out/" + path.basename(source.normalizedPath).replace(".ts","") + ".d.ts";
      }
      // Remove from logs in parser
      parser.donelog.delete(source.internalPath);
      parser.seenlog.delete(source.internalPath);
      // Remove from programs sources
      parser.program.sources = parser.program.sources.filter(
        (_source: Source) => _source !== source
      );
      // Build new Source
      let sourceText = JSONBindingsBuilder.build(source);
      if (writeOut) {
        writeFile("out/" + source.normalizedPath, sourceText, baseDir);
      }
      // Parses file and any new imports added to the source
      parser.parseFile(
        sourceText,
        (isEntry(source) ? "" : "./") + source.normalizedPath,
        isEntry(source)
      );
    });
    //@ts-ignore __dirname exists
    const entryPath = posixRelativePath(baseDir, path.join(__dirname, "../../assembly/bindgen.ts"));
    const entryFile: string = this.readFile(entryPath, baseDir)!;
    this.parser.parseFile(entryFile, entryPath, true);

    if (!JSONTransformer.isTest) {
      TypeChecker.check(parser);
    }
  }
  
  /** Check for floats */
  afterCompile(module: Module): void {
    if (!JSONTransformer.isTest) {
      TypeChecker.checkBinary(module);
    }
    this.writeFile(this.entryPath, TypesTransformer.build(this.program), this.baseDir);
  }
}

export { JSONTransformer };

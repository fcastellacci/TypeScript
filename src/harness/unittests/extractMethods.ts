/// <reference path="..\harness.ts" />
/// <reference path="tsserverProjectSystem.ts" />

namespace ts {
    interface Range {
        start: number;
        end: number;
        name: string;
    }

    interface Test {
        source: string;
        ranges: Map<Range>;
    }

    function extractTest(source: string): Test {
        const activeRanges: Range[] = [];
        let text = "";
        let lastPos = 0;
        let pos = 0;
        const ranges = createMap<Range>();

        while (pos < source.length) {
            if (source.charCodeAt(pos) === CharacterCodes.openBracket &&
                (source.charCodeAt(pos + 1) === CharacterCodes.hash || source.charCodeAt(pos + 1) === CharacterCodes.$)) {
                const saved = pos;
                pos += 2;
                const s = pos;
                consumeIdentifier();
                const e = pos;
                if (source.charCodeAt(pos) === CharacterCodes.bar) {
                    pos++;
                    text += source.substring(lastPos, saved);
                    const name = s === e
                        ? source.charCodeAt(saved + 1) === CharacterCodes.hash ? "selection" : "extracted"
                        : source.substring(s, e);
                    activeRanges.push({ name, start: text.length, end: undefined });
                    lastPos = pos;
                    continue;
                }
                else {
                    pos = saved;
                }
            }
            else if (source.charCodeAt(pos) === CharacterCodes.bar && source.charCodeAt(pos + 1) === CharacterCodes.closeBracket) {
                text += source.substring(lastPos, pos);
                activeRanges[activeRanges.length - 1].end = text.length;
                const range = activeRanges.pop();
                if (range.name in ranges) {
                    throw new Error(`Duplicate name of range ${range.name}`);
                }
                ranges.set(range.name, range);
                pos += 2;
                lastPos = pos;
                continue;
            }
            pos++;
        }
        text += source.substring(lastPos, pos);

        function consumeIdentifier() {
            while (isIdentifierPart(source.charCodeAt(pos), ScriptTarget.Latest)) {
                pos++;
            }
        }
        return { source: text, ranges };
    }

    const newLineCharacter = "\n";
    function getRuleProvider(action?: (opts: FormatCodeSettings) => void) {
        const options = {
            indentSize: 4,
            tabSize: 4,
            newLineCharacter,
            convertTabsToSpaces: true,
            indentStyle: ts.IndentStyle.Smart,
            insertSpaceAfterConstructor: false,
            insertSpaceAfterCommaDelimiter: true,
            insertSpaceAfterSemicolonInForStatements: true,
            insertSpaceBeforeAndAfterBinaryOperators: true,
            insertSpaceAfterKeywordsInControlFlowStatements: true,
            insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
            insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
            insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
            insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
            insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
            insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
            insertSpaceBeforeFunctionParenthesis: false,
            placeOpenBraceOnNewLineForFunctions: false,
            placeOpenBraceOnNewLineForControlBlocks: false,
        };
        if (action) {
            action(options);
        }
        const rulesProvider = new formatting.RulesProvider();
        rulesProvider.ensureUpToDate(options);
        return rulesProvider;
    }

    function testExtractRange(s: string): void {
        const t = extractTest(s);
        const f = createSourceFile("a.ts", t.source, ScriptTarget.Latest, /*setParentNodes*/ true);
        const selectionRange = t.ranges.get("selection");
        if (!selectionRange) {
            throw new Error(`Test ${s} does not specify selection range`);
        }
        const actualRange = codefix.extractMethod.getRangeToExtract(f, createTextSpanFromBounds(selectionRange.start, selectionRange.end));
        const expectedRange = t.ranges.get("extracted");
        if (expectedRange) {
            let start: number, end: number;
            if (ts.isArray(actualRange.range)) {
                start = actualRange.range[0].getStart(f);
                end = ts.lastOrUndefined(actualRange.range).getEnd();
            }
            else {
                start = actualRange.range.getStart(f);
                end = actualRange.range.getEnd();
            }
            assert.equal(start, expectedRange.start, "incorrect start of range");
            assert.equal(end, expectedRange.end, "incorrect end of range");
        }
        else {
            assert.isTrue(!actualRange, `expected range to extract to be undefined`);
        }
    }

    describe("extractMethods", () => {
        it("get extract range from selection", () => {
            testExtractRange(`
                [#|
                [$|var x = 1;
                var y = 2;|]|]
            `);
            testExtractRange(`
                [#|
                var x = 1;
                var y = 2|];
            `);
            testExtractRange(`
                [#|var x = 1|];
                var y = 2;
            `);
            testExtractRange(`
                if ([#|[#extracted|a && b && c && d|]|]) {
                }
            `);
            testExtractRange(`
                if [#|(a && b && c && d|]) {
                }
            `);
            testExtractRange(`
                if (a && b && c && d) {
                [#|    [$|var x = 1;
                    console.log(x);|]    |]
                }
            `);
            testExtractRange(`
                [#|
                if (a) {
                    return 100;
                } |]
            `);
            testExtractRange(`
                function foo() {
                [#|    [$|if (a) {
                    }
                    return 100|] |]
                }
            `);
            testExtractRange(`
                [#|
                [$|l1:
                if (x) {
                    break l1;
                }|]|]
            `);
            testExtractRange(`
                [#|
                [$|l2:
                {
                    if (x) {
                    }
                    break l2;
                }|]|]
            `);
            testExtractRange(`
                while (true) {
                [#|    if(x) {
                    }
                    break;  |]
                }
            `);
            testExtractRange(`
                while (true) {
                [#|    if(x) {
                    }
                    continue;  |]
                }
            `);
            testExtractRange(`
                l3:
                {
                   [#|
                    if (x) {
                    }
                    break l3; |]
                }
            `);
            testExtractRange(`
                function f() {
                    while (true) {
                [#| 
                        if (x) {
                            return;
                        } |]
                    }
                }
            `);
            testExtractRange(`
                function f() {
                    while (true) {
                [#| 
                        [$|if (x) {
                        }
                        return;|]
                |]
                    }
                }
            `);
        });

        testExtractMethod("extractMethod1", 
`namespace A {
    let x = 1;
    function foo() {
    }
    namespace B {
        function a() {
            let a = 1;
        [#|
            let y = 5;
            let z = x;
            a = y;
            foo();|]
        }
    }
}`);
        testExtractMethod("extractMethod2", 
`namespace A {
    let x = 1;
    function foo() {
    }
    namespace B {
        function a() {
        [#|
            let y = 5;
            let z = x;
            return foo();|]
        }
    }
}`);
        testExtractMethod("extractMethod3", 
`namespace A {
    function foo() {
    }
    namespace B {
        function* a(z: number) {
        [#|
            let y = 5;
            yield z;
            return foo();|]
        }
    }
}`);
        testExtractMethod("extractMethod4", 
`namespace A {
    function foo() {
    }
    namespace B {
        async function a(z: number, z1: any) {
        [#|
            let y = 5;
            if (z) {
                await z1;
            }
            return foo();|]
        }
    }
}`);
        testExtractMethod("extractMethod5", 
`namespace A {
    let x = 1;
    export function foo() {
    }
    namespace B {
        function a() {
            let a = 1;
        [#|
            let y = 5;
            let z = x;
            a = y;
            foo();|]
        }
    }
}`);
        testExtractMethod("extractMethod6", 
`namespace A {
    let x = 1;
    export function foo() {
    }
    namespace B {
        function a() {
            let a = 1;
        [#|
            let y = 5;
            let z = x;
            a = y;
            return foo();|]
        }
    }
}`);
        testExtractMethod("extractMethod7", 
`namespace A {
    let x = 1;
    export namespace C {
        export function foo() {
        }
    }
    namespace B {
        function a() {
            let a = 1;
        [#|
            let y = 5;
            let z = x;
            a = y;
            return C.foo();|]
        }
    }
}`);
        testExtractMethod("extractMethod8", 
`namespace A {
    let x = 1;
    namespace B {
        function a() {
            let a1 = 1;
            return 1 + [#|a1 + x|] + 100;
        }
    }
}`);
        testExtractMethod("extractMethod9", 
`namespace A {
    export interface I { x: number };
    namespace B {
        function a() {
            [#|let a1: I = { x: 1 };
            return a1.x + 10;|]
        }
    }
}`);
    });

    
    function testExtractMethod(caption: string, text: string) {
        it(caption, () => {
            Harness.Baseline.runBaseline(`extractMethod/${caption}.js`, () => {
                const t = extractTest(text);
                const selectionRange = t.ranges.get("selection");
                if (!selectionRange) {
                    throw new Error(`Test ${caption} does not specify selection range`);
                }
                const f = {
                    path: "/a.ts",
                    content: t.source
                };
                const host = projectSystem.createServerHost([f]);
                const projectService = projectSystem.createProjectService(host)
                projectService.openClientFile(f.path);
                const program = projectService.inferredProjects[0].getLanguageService().getProgram();
                const sourceFile = program.getSourceFile(f.path);
                const context: CodeFixContext = {
                    cancellationToken: { throwIfCancellationRequested() { }, isCancellationRequested() { return false; } },
                    errorCode: 0,
                    host: undefined,
                    newLineCharacter,
                    program,
                    sourceFile,
                    span: undefined,
                    rulesProvider: getRuleProvider()
                }
                const actualRange = codefix.extractMethod.getRangeToExtract(sourceFile, createTextSpanFromBounds(selectionRange.start, selectionRange.end));
                const results = codefix.extractMethod.extractRange(actualRange, sourceFile, context);
                const data: string[] = [];
                data.push(`==ORIGINAL==`);
                data.push(sourceFile.text)
                for (const r of results) {
                    data.push(`==SCOPE::${r.scopeDescription}==`);
                    data.push(textChanges.applyChanges(sourceFile.text, r.changes[0].textChanges));
                }
                return data.join(newLineCharacter);
            });
        });
    }
}
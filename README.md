# dotnet11-openapi-32-clients-demo

.NET 11 changes the default OpenAPI version that `AddOpenApi()` writes from 3.1 to 3.2.
This repo builds one small minimal API on .NET 10 and on .NET 11 RC2, keeps both documents,
and feeds them to five client generators that .NET + Angular teams use.

## What it proves

- .NET 10 writes `"openapi": "3.1.1"`. .NET 11 RC2 writes `"openapi": "3.2.0"`, at run time
  (`/openapi/v1.json`) and at build time (Microsoft.Extensions.ApiDescription.Server).
- For this API, that version line is the only difference between the two documents.
- NSwag, openapi-typescript, orval and Kiota read the 3.2 document and generate exactly the
  same code as from the 3.1 one. ng-openapi-gen refuses it:
  `Error: Unsupported OpenAPI version: 3.2.0. Only OpenAPI 3.0.x and 3.1.x are supported.`
- `options.OpenApiVersion = Microsoft.OpenApi.OpenApiSpecVersion.OpenApi3_1;` in `AddOpenApi`
  pins the **run-time** document. It does not reach the **build-time** document, which stays at
  3.2.0. That one needs its own option:
  `<OpenApiGenerateDocumentsOptions>--openapi-version OpenApi3_1</OpenApiGenerateDocumentsOptions>`.
- With both pins, every generator accepts the document and produces the same code as on .NET 10.
  The pinned document says `3.1.2` where .NET 10 said `3.1.1`; that line is the only difference.

The reason for the build-time gap is in the ASP.NET Core source:
`src/Tools/GetDocumentInsider/src/Commands/GetDocumentCommandWorker.cs` falls back to a
hard-coded `OpenApiSpecVersion.OpenApi3_2` (release/11.0-rc2, line 364) when
`--openapi-version` isn't passed. On release/10.0 the same line says `OpenApi3_1`, so on .NET 10
the two defaults happened to agree.

## Run it

```
npm install
node scripts/check.mjs
```

If the .NET 11 RC2 SDK isn't your default `dotnet`, point the scripts at it first:
`$env:DOTNET11 = "<folder>\dotnet.exe"` in PowerShell, or `set DOTNET11=...` in cmd.
The .NET 10 SDK 10.0.201 must be on PATH too, for `src/Api10` and `tools/`.

`check.mjs` rebuilds every document from source, compares each with the committed copy in
`docs/`, asserts the version claims above, runs all five generators against the three main
documents, and asserts the table. It ends with `ALL CHECKS PASSED` and exit code 0.

Other entry points:

- `node scripts/build-docs.mjs` rewrites `docs/`.
- `node scripts/run-generators.mjs` prints the table only. Output goes to `out/`.

The table, from the run on 2026-10-25:

```
documents: .NET 10 = "3.1.1", .NET 11 = "3.2.0", .NET 11 pinned = "3.1.2"

generator           .NET 10   .NET 11           .NET 11 pinned
------------------  --------  ----------------  --------------
NSwag               ok, same  ok, same          ok, same
openapi-typescript  ok, same  ok, same          ok, same
ng-openapi-gen      ok, same  REFUSED (exit 1)  ok, same
orval               ok, same  ok, same          ok, same
Kiota               ok, same  ok, same          ok, same
```

"same" means byte-for-byte the code the generator wrote from the .NET 10 document
(Kiota's `kiota-lock.json` is left out of the comparison: it records the input file's path).

## Layout

- `src/Shared/` the API (four endpoints: a list, a get with a 404, a create, a file upload;
  a nullable string, a nullable date, a string enum) and `Program.cs` with the pin behind
  `#if PIN_OPENAPI_31`.
- `src/Api10/` compiles it for net10.0 with Microsoft.AspNetCore.OpenApi 10.0.13.
- `src/Api11/` compiles it for net11.0 with Microsoft.AspNetCore.OpenApi 11.0.0-rc.2.26504.105.
  `-p:PinOpenApi31=true` compiles the `AddOpenApi` pin; `-p:PinBuildTime31=true` sets the
  build-time option.
- `docs/net10.json`, `docs/net11.json`, `docs/net11-pinned.json` are the three documents the
  generators read. The other three files in `docs/` are the evidence for the build-time gap:
  `net11-runtime.json` (default, fetched from the running app), `net11-pin-only-runtime.json`
  (pin in `AddOpenApi`, fetched) and `net11-pin-only-buildtime.json` (same pin, build time).
- `tools/` holds the local dotnet tool manifest (NSwag, Kiota) and a global.json for .NET 10.

## Versions

| Thing | Version |
| --- | --- |
| .NET 10 SDK | 10.0.201 (`src/Api10/global.json`) |
| .NET 11 SDK | 11.0.100-rc.2.26504.105 (`global.json`, prerelease) |
| Microsoft.AspNetCore.OpenApi | 10.0.13 and 11.0.0-rc.2.26504.105 |
| Microsoft.Extensions.ApiDescription.Server | 10.0.13 and 11.0.0-rc.2.26504.105 |
| NSwag.ConsoleCore | 14.7.1 (`openapi2tsclient /template:Angular`) |
| openapi-typescript | 7.13.0 |
| ng-openapi-gen | 1.1.0 |
| orval | 8.45.0 (`--client angular`) |
| Microsoft.OpenApi.Kiota | 1.36.1 (`-l typescript`) |
| Node | 26.1.0 |

## Edge cases the post leaves out

- **The .NET 11 SDK doesn't have to be on PATH.** Set `DOTNET11` and the scripts use it. The
  build-time step (`dotnet-getdocument`) starts whichever `dotnet` is on PATH, not the SDK
  running the build. With .NET 11 installed side by side, that fails with
  `You must install or update .NET to run this application`, so when `DOTNET11` is set the
  scripts put its folder first on PATH and in `DOTNET_ROOT`.
- **NSwag.ConsoleCore 14.7.1 targets net10.0.** On a machine with only the .NET 11 runtime it
  won't start. That's why the dotnet tools live in `tools/` with a .NET 10 global.json.
- **Run-time vs build-time document.** The run-time one carries a `servers` entry for the host
  it's running on; the build-time one doesn't. Kiota warns about the missing `servers` entry for
  every document, 3.1 and 3.2 alike.
- **NSwag types nullable properties as `string | undefined`**, not `string | null`, for both
  versions. Unrelated to 3.2, but worth knowing if you switch generators.
- **This API uses nothing new in 3.2.** A document that does (for example the `QUERY` method or
  `itemSchema` for streamed responses) may get different treatment from the generators that
  accept 3.2 here. Not tested.
- **Swagger UI** isn't tested. Reports say the bundle in Swashbuckle.AspNetCore.SwaggerUI 10.1.4
  and earlier can't render 3.2.
- **ng-openapi-gen's check is a version-string regex** (`/^3\.(0|1)(\.\d+)?$/` in
  `validateOpenApiVersion`). It refuses before reading anything else.
- **Microsoft.OpenApi 3.x** (the dependency of Microsoft.AspNetCore.OpenApi 11) changes the
  types that document, operation and schema transformers work with. This API has no
  transformers, so the demo doesn't cover that breaking change.

## License

MIT

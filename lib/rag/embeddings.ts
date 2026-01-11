08:40:16.504 Running build in Washington, D.C., USA (East) – iad1
08:40:16.508 Build machine configuration: 2 cores, 8 GB
08:40:16.761 Cloning github.com/mkhangopang/Pedagogy-Master (Branch: main, Commit: 4dff27f)
08:40:18.107 Cloning completed: 1.345s
08:40:18.522 Restored build cache from previous deployment (8twpuAhHxpiNM2U4gFXMcj5U64HR)
08:40:19.297 Running "vercel build"
08:40:19.724 Vercel CLI 50.1.6
08:40:20.049 Installing dependencies...
08:40:26.414 
08:40:26.414 added 6 packages in 6s
08:40:26.414 
08:40:26.414 51 packages are looking for funding
08:40:26.415   run `npm fund` for details
08:40:26.455 Detected Next.js version: 14.2.23
08:40:26.460 Running "npm run build"
08:40:27.603 
08:40:27.604 > pedagogy-master@0.1.0 build
08:40:27.604 > next build
08:40:27.604 
08:40:29.227   ▲ Next.js 14.2.23
08:40:29.228 
08:40:29.244    Creating an optimized production build ...
08:40:50.556  ✓ Compiled successfully
08:40:50.557    Linting and checking validity of types ...
08:40:54.778 Failed to compile.
08:40:54.778 
08:40:54.779 ./lib/rag/embeddings.ts:35:5
08:40:54.779 Type error: Type '() => IterableIterator<ContentEmbedding>' is not assignable to type 'number[]'.
08:40:54.779 
08:40:54.779 [0m [90m 33 |[39m     }[0m
08:40:54.779 [0m [90m 34 |[39m[0m
08:40:54.779 [0m[31m[1m>[22m[39m[90m 35 |[39m     [36mreturn[39m embedding[33m.[39mvalues[33m;[39m[0m
08:40:54.779 [0m [90m    |[39m     [31m[1m^[22m[39m[0m
08:40:54.780 [0m [90m 36 |[39m   } [36mcatch[39m (error[33m:[39m any) {[0m
08:40:54.780 [0m [90m 37 |[39m     console[33m.[39merror([32m'[Embedding Error]:'[39m[33m,[39m error)[33m;[39m[0m
08:40:54.780 [0m [90m 38 |[39m     [36mthrow[39m error[33m;[39m[0m
08:40:54.803 Static worker exited with code: 1 and signal: null
08:40:54.824 Error: Command "npm run build" exited with 1

# Third-party notices

Aura Preflight is Apache-2.0 licensed. Its distributed browser build includes or loads the following direct runtime dependencies:

| Component | Version | License | Source |
| --- | ---: | --- | --- |
| React / React DOM | 19.2.8 | MIT | [reactjs/react](https://github.com/facebook/react) |
| Lucide React | 1.34.0 | ISC + derived-icon MIT notice | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) |
| Tesseract.js | 7.0.0 | Apache-2.0 | [naptha/tesseract.js](https://github.com/naptha/tesseract.js) |
| Tesseract.js Core | 7.0.0 | Apache-2.0 | [naptha/tesseract.js-core](https://github.com/naptha/tesseract.js-core) |
| Tesseract English data package | 1.0.0 | MIT | [naptha/tessdata](https://github.com/naptha/tessdata) |
| ZXing Browser | 0.1.5 | MIT | [zxing-js/browser](https://github.com/zxing-js/browser) |
| ZXing Library | 0.21.3 | MIT | [zxing-js/library](https://github.com/zxing-js/library) |
| ExifReader | 4.44.0 | MPL-2.0 | [mattiasw/ExifReader](https://github.com/mattiasw/ExifReader) |

Production builds copy Aura's Apache-2.0 license, this notice, and each bundled
direct dependency's license text into <code>dist/licenses</code>. ExifReader's
corresponding Source Code Form is available from its linked upstream repository,
and the exact version is pinned in <code>package-lock.json</code>.

Build and test dependencies are not shipped in the production browser bundle;
their license declarations remain available in installed package metadata.

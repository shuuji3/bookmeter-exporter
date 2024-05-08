# bookmeter-exporter

Export your own [bookmeter](https://bookmeter.com) data from the website.

(Japanese: [読書メーター](https://bookmeter.com)のウェブサイトから自分のデータをエクスポートします。)

## Usage
        
Prepare your `.env` file by copying `.env.sample` and filling in your username and password:

```shell
cp .env.sample .env
editor .env
```

Export JSON and CSV files from four pages (読んだ本、読んでる本、積読本、読みたい本) under `export/` directory:

```shell
pnpm install
pnpm playwright install chromium
pnpm export 
```

## Development
   
Launch Playwright UI mode:

```shell
pnpm test
```

Then, enable the watch mode and play with the code.

## License

[GNU APGL v3+](LICENSE.txt)

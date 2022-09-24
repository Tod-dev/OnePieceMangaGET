import fetch from "node-fetch";
import * as c from "cheerio";
import fs from "fs";
import request from "request";
import PDFDocument from "pdfkit";

const getTitleData = ($) => {
  //title CHAPTER
  const TITLE_CHAPTER = "Chapter";
  const title = $(".entry-title");
  let titleString = title.text();
  //[DEBUG]titleString = "Chapter2Chapter3";
  //console.log("[DEBUG]title text: ", titleString);
  if (titleString.indexOf(TITLE_CHAPTER) == -1) {
    throw new Error(
      "Error: '" + TITLE_CHAPTER + "' string not found in '" + titleString + "'"
    );
  }
  const titleSplit = titleString.split(TITLE_CHAPTER);
  let chapter = titleSplit[1].trim();
  if (chapter.indexOf("-") != -1) {
    chapter = chapter.split("-")[0].trim();
  }
  //console.log("[DEBUG]chapter check:" + chapter,"legth array: " + titleSplit.length,"isNan: " + isNaN(chapter));
  if (titleSplit.length != 2 || isNaN(chapter)) {
    throw new Error("Error: NUMBER CHAPTER not found in " + titleString);
  }
  //console.log("[DEBUG]chapter CONFIRMED: ", chapter);
  return {
    titleString,
    chapter,
  };
};

const getImagesChapterData = ($, chapterInfo) => {
  const imagesWithAlt = [];
  const container = $(".entry-inner");
  var cont = 0;
  container.find("img").each((i, ele) => {
    try {
      cont++;
      //console.log(i, ele);
      const alt = $(ele).attr("alt");
      const src = $(ele).attr("src");
      //console.log('[DEBUG]',alt, src);
      let toPush;
      if (alt) {
        let imageNumberArray = alt.split(" ");
        let imageNumber = imageNumberArray[imageNumberArray.length - 1];
        //console.log("[DEBUG]imageNumber:", imageNumber);
        if (isNaN(imageNumber)) {
          imageNumberArray = imageNumber.split("_");
          imageNumber = imageNumberArray[imageNumberArray.length - 1];
          if (isNaN(imageNumber)) {
            imageNumberArray = imageNumber.split("-");
            imageNumber = imageNumberArray[imageNumberArray.length - 1];
            if (isNaN(imageNumber))
              throw new Error("Error: Can't find image number in the chapter");
          }
        }
        toPush = {
          id: new Number(imageNumber).valueOf(),
          name: alt,
          url: src,
        };
      } else {
        toPush = {
          id: cont,
          name: cont,
          url: src,
        };
      }

      if (
        !toPush.id ||
        !toPush.name ||
        !toPush.url ||
        (toPush.url.indexOf(".jpg") == -1 &&
          toPush.url.indexOf(".jpeg") == -1 &&
          toPush.url.indexOf(".png") == -1)
      ) {
        console.log("WARNING: IMAGE " + alt + " NOT FOUND -> SKIP");
      } else {
        imagesWithAlt.push(toPush);
      }
    } catch (e) {
      console.log(e);
    }
  });
  return imagesWithAlt;
};

const download = async (uri, filename) => {
  return new Promise((resolve) => {
    request.head(uri, (err, res, body) => {
      //console.log("[DEBUG]content-type:", res.headers["content-type"]);
      //console.log("[DEBUG]content-length:", res.headers["content-length"]);
      let k = request(uri)
        .pipe(fs.createWriteStream(filename))
        .on("close", resolve);
    });
  });
};

const downloadImages = async (imagesWithAlt, dirImg) => {
  imagesWithAlt.sort((a, b) => a.id - b.id); // order by id ASC
  if (!fs.existsSync(dirImg)) {
    fs.mkdirSync(dirImg, { recursive: true });
  }
  for (const v of imagesWithAlt) {
    //console.log("[DEBUG]", v);
    const urlArray = v.url.split(".");
    const urlExtension = urlArray[urlArray.length - 1];
    const imgUriLocal = dirImg + "/" + v.id + "." + urlExtension;
    await download(v.url, imgUriLocal);
  }
};

const addDocImage = async (doc, imgUriLocal) => {
  return new Promise((resolve) => {
    var img = doc.openImage(imgUriLocal);
    doc.addPage({ size: [img.width, img.height] });
    doc.image(img, 0, 0);
    fs.unlink(imgUriLocal, resolve);
  });
};

const makePdf = async (imagesWithAlt, chapterInfo, dirImg) => {
  var dirPdf = "./chapters";
  if (!fs.existsSync(dirPdf)) {
    fs.mkdirSync(dirPdf, { recursive: true });
  }
  // Create a document
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.info["Title"] = chapterInfo.titleString.trim();
  // Pipe its output somewhere, like to a file or HTTP response
  // See below for browser usage
  const pathPdf = dirPdf + "/" + chapterInfo.chapter + ".pdf";
  doc.pipe(fs.createWriteStream(pathPdf));
  // Embed a font, set the font size, and render some text
  //doc.fontSize(35).text(chapterInfo.titleString.trim(), 100, 100);
  for (let i = 0; i < imagesWithAlt.length; i++) {
    const v = imagesWithAlt[i];
    //console.log("[DEBUG]", v)
    const urlArray = v.url.split(".");
    const urlExtension = urlArray[urlArray.length - 1];
    const imgUriLocal = dirImg + "/" + v.id + "." + urlExtension;
    // Add an image, constrain it to a given size, and center it vertically and horizontally
    await addDocImage(doc, imgUriLocal);
  }
  // Finalize PDF file
  doc.end();
  return pathPdf;
};

const getDataOfOneChapter = async (url, stopAfterNumber) => {
  const response = await fetch(url);
  const html = await response.text();

  const $ = c.load(html);
  const chapterInfo = getTitleData($);

  if (stopAfterNumber) {
    return chapterInfo;
  }

  const imagesWithAlt = getImagesChapterData($, chapterInfo);

  console.log(
    "\x1b[33m%s\x1b[0m",
    "CHAPTER FIND: '" +
      chapterInfo.titleString.trim() +
      "' [" +
      imagesWithAlt.length +
      " PAGES]"
  );

  //console.log("[DEBUG] ", imagesWithAlt);

  console.log("START TO CREATE THE CHAPTER " + chapterInfo.chapter);

  const dirImages = "./chapters/images";
  const dirImg = dirImages + "/" + chapterInfo.chapter;
  console.log("\x1b[32m%s\x1b[0m", "...");

  await downloadImages(imagesWithAlt, dirImg);
  console.log("DONE images download");
  console.log("START pdf download");
  const pathPdf = await makePdf(imagesWithAlt, chapterInfo, dirImg);
  console.log("\x1b[32m%s\x1b[0m", "DONE pdf download: ", pathPdf);
  console.log("DELETE IMAGES");
  fs.rmSync(dirImages, { recursive: true, force: true });
};
//const url = "https://ww8.1piecemanga.com/manga/one-piece-chapter-1061/";
//const url = "https://ww8.1piecemanga.com/manga/one-piece-chapter-2-111/";
//getDataOfOneChapter(url);

const main = async () => {
  let error = false;
  let A, B;
  if (process.argv.length != 4) error = true;
  else {
    A = process.argv[2];
    B = process.argv[3];
    if (isNaN(A) || isNaN(B)) error = true;
    else {
      A = Number(A);
      B = Number(B);
      if (A < 0 || B < A) error = true;
    }
  }
  //console.log(A, B, error);
  if (error) {
    console.log("Error, usage: node main.js A B");
    console.log(
      "Where A>=1 and B >=A, , the program will download all chapter in [A,B]"
    );
    return;
  }
  //START
  const url = "https://ww8.1piecemanga.com/";
  const response = await fetch(url);
  const html = await response.text();
  const $ = c.load(html);
  const container = $("#ceo_thumbnail_widget-2");
  const hrefs = [];
  container.find("a").each(async (i, ele) => {
    try {
      //console.log(i, ele);
      const href = $(ele).attr("href");
      //console.log("[DEBUG]", href);
      hrefs.push(href);
    } catch (e) {
      console.log(e);
    }
  });
  console.log("START SCANNING");
  for (const url of hrefs) {
    const { chapter } = await getDataOfOneChapter(url, true);
    console.log(url, chapter);
    if (chapter >= A && chapter <= B) {
      await getDataOfOneChapter(url, false);
    }
    //if (chapter > B) break;
  }
};

main();

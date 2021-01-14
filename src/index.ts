import {
  Client,
  PlaceInputType,
  Status,
} from "@googlemaps/google-maps-services-js";
import { existsSync, writeFileSync } from "fs";
import mime from "mime-types";
import json from "./bd-places.json";
import { Data } from "./type";

const regex = /[^a-z0-9]/gi;
const safe = "_";

const urlSafe = (filename: string) =>
  filename.replace(regex, safe).toLowerCase();

const delay = (time: number) =>
  new Promise((res) => setTimeout(() => res({}), time));

const client = new Client({});

const APIKEY = process.env.GOOGLE_API_KEY;

if (!APIKEY) {
  throw new Error("GOOGLE_API_KEY environment variable is needed.");
}

const getPhoto = async (placeName: string, fileName: string) => {
  try {
    const exists = `./src/images/${urlSafe(fileName)}.jpeg`;

    if (existsSync(exists)) {
      console.log(`Already exists for ${placeName}`);
      return `${urlSafe(fileName)}.jpeg`;
    }

    await delay(2000);
    const place = await client.findPlaceFromText({
      params: {
        input: placeName,
        inputtype: PlaceInputType.textQuery,
        key: APIKEY,
        fields: ["photos"],
      },
      timeout: 30000,
    });

    if (place.data.status !== Status.OK) {
      throw new Error("Place Not Found");
    }
    const ref = place.data.candidates[0].photos![0].photo_reference;

    if (!ref) {
      throw new Error("Place does not have a photo");
    }
    await delay(2000);
    const photoRes = await client.placePhoto({
      params: { photoreference: ref, maxwidth: 1920, key: APIKEY },
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const data = {
      data: photoRes.data,
      tyoe: photoRes.headers["content-type"],
    };

    const file = `${urlSafe(fileName)}.${mime.extension(data.tyoe)}`;

    writeFileSync(`./src/images/${file}`, data.data);
    console.log("Photo saved for " + placeName + ".");
    return file;
  } catch (error) {
    console.log(String(error));
    console.log("Photo not found for " + placeName + ".");
    return null;
  }
};

const main = async () => {
  const newJson = await Promise.all(
    (json as Data[]).map(async (division) => {
      let icon;
      if (!division.icon) {
        icon = await getPhoto(division.name, division.name);
      }
      const districts = await Promise.all(
        division.districts!.map(async (district) => {
          let icon;
          if (!district.icon) {
            icon = await getPhoto(
              district.name,
              `${division.name}-${district.name}`
            );
          }
          const subdistricts = await Promise.all(
            district.subdistricts!.map(async (sub) => {
              if (!sub.icon) {
                const icon = await getPhoto(
                  sub.name,
                  `${division.name}-${district.name}-${sub.name}`
                );
                if (icon) {
                  return { ...sub, icon };
                } else {
                  return { ...sub };
                }
              } else {
                return { ...sub };
              }
            })
          );
          if (icon) {
            return { ...district, icon, subdistricts };
          }
          return { ...district, subdistricts };
        })
      );
      if (icon) {
        return { ...division, icon, districts };
      }
      return { ...division, districts };
    })
  );

  writeFileSync("./src/bd-places.json", JSON.stringify(newJson, null, 2));
};

main();

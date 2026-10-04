import * as Location from "expo-location";
import { Platform } from "react-native";

export type AllwainCurrentLocation = {
  latitude: number;
  longitude: number;
  address: string;
  locationLabel: string;
  accuracyMeters?: number;
  postalCode?: string;
  city?: string;
  countryCode?: string;
};

function compact(parts: (string | null | undefined)[]) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("LOCATION_TIMEOUT")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function roundApproximateCoordinate(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function approximateLocationLabel(latitude: number, longitude: number) {
  return `Zona aproximada (${latitude.toFixed(3)}, ${longitude.toFixed(3)})`;
}

function browserLocationError(error: any) {
  if (error?.code === 1) {
    return new Error(
      "El acceso a la ubicación está bloqueado. Permítelo en el candado del navegador o escribe la dirección.",
    );
  }
  if (error?.code === 2) {
    return new Error(
      "El dispositivo no pudo calcular tu ubicación. Activa la ubicación e inténtalo de nuevo o escribe la dirección.",
    );
  }
  if (error?.code === 3 || error?.message === "LOCATION_TIMEOUT") {
    return new Error(
      "La ubicación está tardando demasiado. Acércate a una ventana o escribe la dirección manualmente.",
    );
  }
  if (error?.message === "WEB_GEOLOCATION_INSECURE") {
    return new Error(
      "La ubicación solo funciona desde una conexión segura. Abre Allwain con https:// o escribe la dirección.",
    );
  }
  return new Error(
    "No pudimos obtener tu ubicación. Puedes escribir la dirección manualmente.",
  );
}

function getBrowserPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if ((globalThis as any)?.isSecureContext === false) {
      reject(new Error("WEB_GEOLOCATION_INSECURE"));
      return;
    }
    const geolocation = (globalThis as any)?.navigator?.geolocation;
    if (!geolocation) {
      reject(new Error("WEB_GEOLOCATION_UNAVAILABLE"));
      return;
    }
    geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 25_000,
    });
  });
}

function requireAccurateFix(coords: { accuracy: number | null }) {
  if (coords.accuracy === null || !Number.isFinite(coords.accuracy) || coords.accuracy > 50) {
    throw new Error("La ubicación no tiene suficiente precisión para una entrega. Activa la ubicación precisa, acércate a una ventana o escribe la dirección manualmente.");
  }
}

export async function getAllwainCurrentLocation(options: { preciseDelivery?: boolean } = {}): Promise<AllwainCurrentLocation> {
  if (Platform.OS === "web") {
    try {
      const position = await withTimeout(getBrowserPosition(), 25_500);
      requireAccurateFix(position.coords);
      const latitude = options.preciseDelivery ? position.coords.latitude : roundApproximateCoordinate(position.coords.latitude);
      const longitude = options.preciseDelivery ? position.coords.longitude : roundApproximateCoordinate(position.coords.longitude);
      return {
        latitude,
        longitude,
        address: "",
        locationLabel: approximateLocationLabel(latitude, longitude),
        accuracyMeters: Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : undefined,
      };
    } catch (error: any) {
      if (error?.message?.startsWith("La ubicación no tiene")) throw error;
      throw browserLocationError(error);
    }
  }

  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Necesitamos permiso para usar tu ubicación.");
  }

  let position: Location.LocationObject | null = null;
  try {
    position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
      25_000,
    );
  } catch {
    position = null;
  }
  if (!position) {
    throw new Error(
      "No pudimos obtener tu ubicación. Puedes escribir la dirección manualmente.",
    );
  }
  const preciseLatitude = position.coords.latitude;
  const preciseLongitude = position.coords.longitude;
  requireAccurateFix(position.coords);

  let place: Location.LocationGeocodedAddress | undefined;
  try {
    [place] = await withTimeout(
      Location.reverseGeocodeAsync({
        latitude: preciseLatitude,
        longitude: preciseLongitude,
      }),
      8_000,
    );
  } catch {
    // The coordinates remain useful for proximity matching if geocoding is unavailable.
  }

  const street = compact([place?.street || place?.name, place?.streetNumber]).join(" ");
  const latitude = options.preciseDelivery ? preciseLatitude : roundApproximateCoordinate(preciseLatitude);
  const longitude = options.preciseDelivery ? preciseLongitude : roundApproximateCoordinate(preciseLongitude);
  const locationLabel =
    place?.city ||
    place?.district ||
    place?.subregion ||
    place?.region ||
    approximateLocationLabel(latitude, longitude);
  const address = compact([
    street,
    place?.postalCode,
    place?.city || place?.district || place?.subregion,
    place?.region,
  ]).join(", ");

  return {
    latitude,
    longitude,
    address,
    locationLabel,
    accuracyMeters: Number.isFinite(position.coords.accuracy)
      ? Math.round(position.coords.accuracy || 0)
      : undefined,
    postalCode: place?.postalCode || undefined,
    city: place?.city || place?.district || place?.subregion || undefined,
    countryCode: place?.isoCountryCode || undefined,
  };
}

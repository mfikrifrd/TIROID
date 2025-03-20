"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { database } from "../app/config/firebase";
import { ref, onValue, off, set } from "firebase/database";

export default function PitaToscaDashboard() {
  const [profileImage, setProfileImage] = useState("/tiroid.png");
  const [sensorData, setSensorData] = useState({
    bpm: 0,
    tremor: 0,
    dosage: 0,
  });
  const [historyData, setHistoryData] = useState([]);
  const [originalHistoryData, setOriginalHistoryData] = useState(null);
  const [referenceDate, setReferenceDate] = useState(null);
  const [initialPredictionDate, setInitialPredictionDate] = useState(null);

  // Fungsi untuk mereset riwayat dan data di Firebase
  const resetHistory = () => {
    const patientId = "patient001";
    const readingsRef = ref(database, `/patients/${patientId}/readings`);

    // Simpan data asli sebelum reset
    setOriginalHistoryData(historyData);
    // Kosongkan riwayat lokal
    setHistoryData([]);
    // Reset data di Firebase
    set(readingsRef, null);
    // Atur ulang tanggal referensi ke waktu saat ini saat reset
    const newRefDate = Date.now();
    setReferenceDate(newRefDate);
    setInitialPredictionDate(new Date(newRefDate + 7 * 24 * 60 * 60 * 1000));
  };

  // Fungsi untuk undo reset
  const undoReset = () => {
    if (originalHistoryData) {
      const patientId = "patient001";
      const readingsRef = ref(database, `/patients/${patientId}/readings`);

      // Kembalikan data ke Firebase
      const dataToRestore = {};
      originalHistoryData.forEach((item) => {
        dataToRestore[item.id] = {
          bpm: item.bpm,
          tremor: item.tremor,
          dosage: item.dosage,
          timestamp: item.timestamp,
        };
      });
      set(readingsRef, dataToRestore);

      // Kembalikan data lokal
      setHistoryData(originalHistoryData);
      setOriginalHistoryData(null);
      // Kembalikan tanggal referensi ke nilai awal (opsional, bisa disesuaikan)
      setReferenceDate(null); // Atau simpan referenceDate sebelum reset jika ingin dikembalikan
      setInitialPredictionDate(null);
    }
  };

  const getHeartRateStatus = (bpm) => {
    if (bpm <= 60) return { text: "Low", color: "text-blue-500" };
    if (bpm >= 90) return { text: "High", color: "text-red-500" };
    return { text: "Normal", color: "text-green-500" };
  };

  const getTremorStatus = (tremor) => {
    if (tremor <= 5) return { text: "Low", color: "text-green-500" };
    if (tremor >= 8) return { text: "High", color: "text-red-500" };
    return { text: "Normal", color: "text-yellow-500" };
  };

  const getDosageStatus = (dosage) => {
    if (dosage <= 10) return { text: "Low", color: "text-green-500" };
    if (dosage >= 20) return { text: "High", color: "text-red-500" };
    return { text: "Normal", color: "text-green-500" };
  };

  const predictNextValues = () => {
    if (historyData.length < 3) return null;
    const recentData = historyData.slice(-3);
    const bpmChange = (recentData[2].bpm - recentData[0].bpm) / 2;
    const tremorChange = (recentData[2].tremor - recentData[0].tremor) / 2;
    const predictedBpm = Math.round((recentData[2].bpm + bpmChange) * 10) / 10;
    const predictedTremor =
      Math.round((recentData[2].tremor + tremorChange) * 100) / 100;
    const predictedDosage = calculatePredictedDosage(predictedBpm, predictedTremor);

    // Gunakan tanggal referensi untuk menghitung tanggal prediksi
    let predictionDate;
    if (!initialPredictionDate) {
      const newPredDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setInitialPredictionDate(newPredDate);
      predictionDate = newPredDate;
    } else {
      predictionDate = initialPredictionDate;
    }

    return {
      bpm: predictedBpm,
      tremor: predictedTremor,
      dosage: predictedDosage,
      date: predictionDate.toLocaleDateString("en-ID", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    };
  };

  const calculatePredictedDosage = (bpm, tremor) => {
    let dosage = 10;
    if (bpm < 60) dosage -= 2;
    else if (bpm > 90) dosage += 5;
    if (tremor < 5) dosage -= 2;
    else if (tremor > 8) dosage += 5;
    return Math.round(dosage * 10) / 10;
  };

  useEffect(() => {
    const patientId = "patient001";
    const readingsRef = ref(database, `/patients/${patientId}/readings`);

    const unsubscribe = onValue(readingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const dataArray = Object.entries(data)
          .map(([key, value]) => ({
            id: key,
            ...value,
          }))
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (dataArray.length > 0) {
          setSensorData({
            bpm: dataArray[0].bpm,
            tremor: dataArray[0].tremor,
            dosage: dataArray[0].dosage,
          });
        }
        setHistoryData(dataArray);
      } else {
        setSensorData({ bpm: 0, tremor: 0, dosage: 0 });
        if (!originalHistoryData) setHistoryData([]);
      }
    });

    return () => off(readingsRef);
  }, []);

  const heartStatus = getHeartRateStatus(sensorData.bpm);
  const tremorStatus = getTremorStatus(sensorData.tremor);
  const dosageStatus = getDosageStatus(sensorData.dosage);
  const prediction = predictNextValues();

  return (
    <div className="bg-teal-800 flex justify-center items-center min-h-screen">
      <div className="bg-teal-800 text-white p-6 rounded-xl w-full max-w-7xl min-h-screen flex">
        <div className="bg-red-700 w-32 flex flex-col items-center py-8 text-white relative rounded-2xl">
          <div className="w-32 h-32 flex justify-center items-center absolute top-6">
            <label htmlFor="uploadImage" className="cursor-pointer block">
              <div className="relative w-32 h-32">
                <Image
                  id="displayImage"
                  src={profileImage}
                  alt="tiroid"
                  className="object-cover rounded-lg"
                  width={128}
                  height={128}
                />
              </div>
            </label>
          </div>
          <div className="text-4xl font-bold flex flex-col items-center tracking-widest mt-32">
            <span className="relative top-[-4px]">P</span>
            <span className="relative top-[-4px]">I</span>
            <span className="relative top-[-4px]">T</span>
            <span className="relative top-[-4px] mb-2">A</span>
            <span className="mt-4"></span>
            <span>T</span>
            <span>O</span>
            <span>S</span>
            <span>C</span>
            <span>A</span>
          </div>
        </div>

        <div className="flex-1 p-6 relative">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">#PejuangTiroid</h1>
            <span className="text-sm text-gray-300">
              {new Date().toLocaleDateString("en-ID", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white text-gray-800 p-4 rounded-lg shadow-md flex items-center">
              <div className="relative w-24 h-24 mr-4">
                <Image
                  src="/tremor.png"
                  alt="Tremor Image"
                  className="object-cover rounded-lg"
                  width={96}
                  height={96}
                />
              </div>
              <div>
                <p className="text-sm font-bold">Tremor</p>
                <p className="text-2xl font-semibold">
                  {sensorData.tremor.toFixed(1)} Hz
                </p>
                <p className={`text-sm ${tremorStatus.color}`}>
                  {tremorStatus.text}
                </p>
              </div>
            </div>

            <div className="bg-white text-gray-800 p-4 rounded-lg shadow-md flex items-center">
              <div className="relative w-24 h-24 mr-4">
                <Image
                  src="/heartrate.png"
                  alt="Heart Rate Image"
                  className="object-cover rounded-lg"
                  width={96}
                  height={96}
                />
              </div>
              <div>
                <p className="text-sm font-bold">Heart Rate</p>
                <p className="text-2xl font-semibold">
                  {sensorData.bpm.toFixed(0)} bpm
                </p>
                <p className={`text-sm ${heartStatus.color}`}>
                  {heartStatus.text}
                </p>
              </div>
            </div>

            <div className="bg-white text-gray-800 p-4 rounded-lg shadow-md flex items-center">
              <div className="relative w-24 h-24 mr-4">
                <Image
                  src="/dose.png"
                  alt="Dose Image"
                  className="object-cover rounded-lg"
                  width={96}
                  height={96}
                />
              </div>
              <div>
                <p className="text-sm font-bold">Dose</p>
                <p className="text-2xl font-semibold">
                  {sensorData.dosage.toFixed(1)} mg
                </p>
                <p className={`text-sm ${dosageStatus.color}`}>
                  {dosageStatus.text}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-white p-4 rounded-lg shadow-md w-[700px] h-[320px]">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold text-gray-800">History</h2>
                <div className="space-x-2">
                  {historyData.length > 0 && (
                    <button
                      onClick={resetHistory}
                      className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-600"
                    >
                      Reset History
                    </button>
                  )}
                  {originalHistoryData && (
                    <button
                      onClick={undoReset}
                      className="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-blue-600"
                    >
                      Undo Reset
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-y-auto max-h-60">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Heart Rate
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tremor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dosage
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {historyData.slice(0, 30).map((item, index) => (
                      <tr key={item.id || index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.timestamp}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.bpm.toFixed(1)} bpm
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.tremor.toFixed(2)} Hz
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.dosage.toFixed(1)} mg
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-md w-[340px] h-[320px]">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                AI Prediction
              </h2>
              <div className="overflow-hidden">
                {prediction ? (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-700 mb-2">
                      Predicted for:{" "}
                      <span className="font-medium">{prediction.date}</span>
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Heart Rate:</span>
                        <span
                          className={`text-sm font-medium ${getHeartRateStatus(
                            prediction.bpm
                          ).color}`}
                        >
                          {prediction.bpm.toFixed(1)} bpm
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Tremor:</span>
                        <span
                          className={`text-sm font-medium ${getTremorStatus(
                            prediction.tremor
                          ).color}`}
                        >
                          {prediction.tremor.toFixed(2)} Hz
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">
                          Recommended Dose:
                        </span>
                        <span
                          className={`text-sm font-medium ${getDosageStatus(
                            prediction.dosage
                          ).color}`}
                        >
                          {prediction.dosage.toFixed(1)} mg
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 p-2 bg-blue-50 rounded border border-blue-100">
                      <p className="text-xs text-blue-700">
                        This prediction is based on your recent measurement trends.
                        Always consult your doctor before changing medication.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48">
                    <p className="text-sm text-gray-500">
                      Not enough data for prediction
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex justify-between items-center w-full px-6">
            <span className="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm">
              Hipertiroidisme
            </span>
            <span className="text-gray-300">#PeriksaLeherAnda</span>
          </div>
        </div>
      </div>
    </div>
  );
}
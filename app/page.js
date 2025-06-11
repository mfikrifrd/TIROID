"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { database } from "../app/config/firebase";
import { ref, onValue, off, set, update } from "firebase/database";
import { Chart } from 'chart.js/auto';

export default function PitaToscaDashboard() {
  const [profileImage, setProfileImage] = useState("/tiroid.png");
  const [sensorData, setSensorData] = useState({
    bpm: 0,
    tremor: 0,
    dosage: 0,
    condition: "",
  });
  const [historyData, setHistoryData] = useState([]);
  const [originalHistoryData, setOriginalHistoryData] = useState(null);
  const [initialPredictionDate, setInitialPredictionDate] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [tremorChart, setTremorChart] = useState(null);
  const [heartRateChart, setHeartRateChart] = useState(null);
  const [doseChart, setDoseChart] = useState(null);

  const patientId = "patient001";
  const readingsRef = ref(database, `/patients/${patientId}/readings`);
  const predictionDateRef = ref(database, `/patients/${patientId}/predictionDate`);

  const resetHistory = async () => {
    try {
      if (historyData.length > 0) {
        console.log("Saving history data before reset:", historyData);
        setOriginalHistoryData([...historyData]);
      } else {
        console.log("No history data to save before reset.");
        setOriginalHistoryData(null);
      }

      await set(readingsRef, null);
      setHistoryData([]);
      setSensorData({ bpm: 0, tremor: 0, dosage: 0, condition: "" });

      const newRefDate = new Date("2025-05-28").getTime();
      const newPredDate = new Date(newRefDate + 10 * 24 * 60 * 60 * 1000);
      await set(predictionDateRef, newPredDate.toISOString());
      setInitialPredictionDate(newPredDate);
    } catch (error) {
      console.error("Error resetting data:", error);
    }
  };

  const undoReset = async () => {
    if (originalHistoryData && originalHistoryData.length > 0) {
      try {
        console.log("Restoring data:", originalHistoryData);

        const dataToRestore = {};
        originalHistoryData.forEach((item) => {
          dataToRestore[item.id] = {
            bpm: item.bpm || 0,
            tremor: item.tremor || 0,
            dosage: item.dosage || 0,
            timestamp: item.timestamp || new Date().toISOString(),
            condition: item.condition || "normal_activity",
          };
        });

        await set(readingsRef, dataToRestore);
        console.log("Data successfully restored to Firebase.");

        const restoredData = Object.entries(dataToRestore)
          .map(([key, value]) => ({
            id: key,
            ...value,
          }))
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        setHistoryData(restoredData);
        if (restoredData.length > 0) {
          setSensorData({
            bpm: restoredData[0].bpm,
            tremor: restoredData[0].tremor,
            dosage: restoredData[0].dosage,
            condition: restoredData[0].condition,
          });
        }

        const firstTimestamp = new Date(restoredData[0].timestamp).getTime();
        const restoredPredDate = new Date(firstTimestamp + 10 * 24 * 60 * 60 * 1000);
        await set(predictionDateRef, restoredPredDate.toISOString());
        setInitialPredictionDate(restoredPredDate);

        setOriginalHistoryData(null);
      } catch (error) {
        console.error("Error restoring data to Firebase:", error);
      }
    } else {
      console.log("No data to restore.");
    }
  };

  const getHeartRateStatus = (bpm) => {
    if (bpm <= 60) return { text: "Low", color: "text-blue-500" };
    if (bpm >= 90) return { text: "High", color: "text-red-500" };
    return { text: "Normal", color: "text-green-500" };
  };

  const getTremorStatus = (tremor) => {
    if (tremor <= 5) return { text: "Mild", color: "text-green-500" };
    if (tremor >= 8) return { text: "Severe", color: "text-red-500" };
    return { text: "Moderate", color: "text-yellow-500" };
  };

  const getDosageStatus = (dosage) => {
    if (dosage <= 10) return { text: "Low", color: "text-green-500" };
    if (dosage >= 20) return { text: "High", color: "text-red-500" };
    return { text: "Moderate", color: "text-green-500" };
  };

  const updateCondition = (readingId, newCondition) => {
    const readingRef = ref(database, `/patients/${patientId}/readings/${readingId}`);
    update(readingRef, { condition: newCondition });
  };

  const calculateSimpleAverage = (data, key) => {
    if (data.length === 0) return 0;
    const sum = data.reduce((acc, item) => acc + (item[key] || 0), 0);
    return sum / data.length;
  };

  const customRoundDosage = (num) => {
    if (num >= 11 && num <= 15) return 10;
    if (num >= 16 && num <= 20) return 20;
    if (num >= 21 && num <= 25) return 20;
    if (num >= 26 && num <= 30) return 30;
    return Math.round(num / 10) * 10;
  };

  const trapezoidalMembership = (x, a, b, c, d) => {
    if (x <= a || x >= d) return 0;
    if (x >= b && x <= c) return 1;
    if (x > a && x < b) return (x - a) / (b - a);
    if (x > c && x < d) return (d - x) / (d - c);
    return 0;
  };

  const applyFuzzyLogic = (bpm, tremor) => {
    const bpmMembership = {
      rendah: trapezoidalMembership(bpm, 40, 40, 50, 60),
      normal: trapezoidalMembership(bpm, 60, 70, 80, 90),
      tinggi: trapezoidalMembership(bpm, 90, 120, 180, 180),
    };

    const tremorMembership = {
      ringan: trapezoidalMembership(tremor, 3, 4, 5, 5),
      sedang: trapezoidalMembership(tremor, 3, 6.5, 8, 8),
      berat: trapezoidalMembership(tremor, 8, 10, 12, 12),
    };

    const rules = [
      { if: { bpm: "rendah", tremor: "ringan" }, then: { dosage: "rendah" } },
      { if: { bpm: "rendah", tremor: "sedang" }, then: { dosage: "rendah" } },
      { if: { bpm: "rendah", tremor: "berat" }, then: { dosage: "sedang" } },
      { if: { bpm: "normal", tremor: "ringan" }, then: { dosage: "rendah" } },
      { if: { bpm: "normal", tremor: "sedang" }, then: { dosage: "sedang" } },
      { if: { bpm: "normal", tremor: "berat" }, then: { dosage: "tinggi" } },
      { if: { bpm: "tinggi", tremor: "ringan" }, then: { dosage: "sedang" } },
      { if: { bpm: "tinggi", tremor: "sedang" }, then: { dosage: "tinggi" } },
      { if: { bpm: "tinggi", tremor: "berat" }, then: { dosage: "tinggi" } },
    ];

    const activations = rules.map((rule) => {
      const bpmDegree = bpmMembership[rule.if.bpm];
      const tremorDegree = tremorMembership[rule.if.tremor];
      const activation = Math.min(bpmDegree, tremorDegree);
      return { activation, output: rule.then };
    });

    const outputRanges = {
      dosage: {
        rendah: 5,
        sedang: 15,
        tinggi: 30,
      },
    };

    let dosageSum = 0,
      dosageWeight = 0;
    activations.forEach(({ activation, output }) => {
      dosageSum += outputRanges.dosage[output.dosage] * activation;
      dosageWeight += activation;
    });

    const predictedDosage = dosageWeight > 0 ? dosageSum / dosageWeight : 10;

    return {
      bpm: Math.round(bpm * 10) / 10,
      tremor: Math.round(tremor * 100) / 100,
      dosage: customRoundDosage(predictedDosage),
    };
  };

  const predictNextValues = () => {
    if (historyData.length < 1) return null;

    const avgBpm = calculateSimpleAverage(historyData, "bpm");
    const avgTremor = calculateSimpleAverage(historyData, "tremor");

    const { bpm, tremor, dosage } = applyFuzzyLogic(avgBpm, avgTremor);

    return {
      bpm,
      tremor,
      dosage,
      date: initialPredictionDate
        ? initialPredictionDate.toLocaleDateString("en-ID", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "Not set",
    };
  };

  useEffect(() => {
    const unsubscribeReadings = onValue(readingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const dataArray = Object.entries(data)
          .map(([key, value]) => ({
            id: key,
            ...value,
          }))
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        console.log("Data from Firebase:", dataArray);

        if (dataArray.length > 0) {
          setSensorData({
            bpm: dataArray[0].bpm,
            tremor: dataArray[0].tremor,
            dosage: dataArray[0].dosage,
            condition: dataArray[0].condition || "normal_activity",
          });
        }
        setHistoryData(dataArray);

        // Update charts
        if (tremorChart) tremorChart.destroy();
        if (heartRateChart) heartRateChart.destroy();
        if (doseChart) doseChart.destroy();

        const ctxTremor = document.getElementById('tremorChart').getContext('2d');
        const ctxHeartRate = document.getElementById('heartRateChart').getContext('2d');
        const ctxDose = document.getElementById('doseChart').getContext('2d');

        setTremorChart(new Chart(ctxTremor, {
          type: 'line',
          data: {
            labels: dataArray.map(item => new Date(item.timestamp).toLocaleDateString()),
            datasets: [{
              label: 'Tremor (Hz)',
              data: dataArray.map(item => item.tremor),
              borderColor: 'rgba(75, 192, 192, 1)',
              tension: 0.1
            }]
          },
          options: { responsive: true, scales: { y: { beginAtZero: true } } }
        }));

        setHeartRateChart(new Chart(ctxHeartRate, {
          type: 'line',
          data: {
            labels: dataArray.map(item => new Date(item.timestamp).toLocaleDateString()),
            datasets: [{
              label: 'Heart Rate (bpm)',
              data: dataArray.map(item => item.bpm),
              borderColor: 'rgba(255, 99, 132, 1)',
              tension: 0.1
            }]
          },
          options: { responsive: true, scales: { y: { beginAtZero: true } } }
        }));

        setDoseChart(new Chart(ctxDose, {
          type: 'line',
          data: {
            labels: dataArray.map(item => new Date(item.timestamp).toLocaleDateString()),
            datasets: [{
              label: 'Dose (mg)',
              data: dataArray.map(item => item.dosage),
              borderColor: 'rgba(54, 162, 235, 1)',
              tension: 0.1
            }]
          },
          options: { responsive: true, scales: { y: { beginAtZero: true } } }
        }));
      } else {
        console.log("No data in Firebase, resetting local state.");
        setSensorData({ bpm: 0, tremor: 0, dosage: 0, condition: "" });
        if (!originalHistoryData) setHistoryData([]);
      }
    }, (error) => {
      console.error("Error fetching readings from Firebase:", error);
    });

    const unsubscribePredictionDate = onValue(predictionDateRef, (snapshot) => {
      const predDate = snapshot.val();
      if (predDate) {
        setInitialPredictionDate(new Date(predDate));
      } else {
        const defaultRefDate = new Date("2025-05-28").getTime();
        const defaultPredDate = new Date(defaultRefDate + 10 * 24 * 60 * 60 * 1000);
        set(predictionDateRef, defaultPredDate.toISOString());
        setInitialPredictionDate(defaultPredDate);
      }
    }, (error) => {
      console.error("Error fetching prediction date from Firebase:", error);
    });

    return () => {
      off(readingsRef);
      off(predictionDateRef);
      if (tremorChart) tremorChart.destroy();
      if (heartRateChart) heartRateChart.destroy();
      if (doseChart) doseChart.destroy();
    };
  }, []);

  const heartStatus = getHeartRateStatus(sensorData.bpm);
  const tremorStatus = getTremorStatus(sensorData.tremor);
  const dosageStatus = getDosageStatus(sensorData.dosage);
  const prediction = predictNextValues();

  const goToPage = (page) => {
    setCurrentPage(page);
  };

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
          <div className="text-4xl font-bold flex flex-col items-center tracking-widest mt-16">
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
          <div className="mt-12 flex justify-center space-x-2">
            <button
              onClick={() => goToPage(1)}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
            >
              1
            </button>
            <button
              onClick={() => goToPage(2)}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
            >
              2
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 relative">
          {currentPage === 1 && (
            <>
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
                    <p className={`text-sm ${tremorStatus.color}`}>{tremorStatus.text}</p>
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
                    <p className={`text-sm ${heartStatus.color}`}>{heartStatus.text}</p>
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
                    <p className={`text-sm ${dosageStatus.color}`}>{dosageStatus.text}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <canvas id="tremorChart" height="300"></canvas>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <canvas id="heartRateChart" height="300"></canvas>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-md">
                  <canvas id="doseChart" height="300"></canvas>
                </div>
              </div>
            </>
          )}
          {currentPage === 2 && (
            <>
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
                      {originalHistoryData && originalHistoryData.length > 0 && (
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
                    <table className="w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[150px]">
                            Date
                          </th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[140px]">
                            Condition
                          </th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[110px]">
                            Heart Rate
                          </th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                            Tremor
                          </th>
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[100px]">
                            Dosage
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {historyData.slice(0, 100).map((item, index) => (
                          <tr key={item.id || index}>
                            <td className="px-2 py-4 whitespace-normal text-sm text-gray-500 w-[150px]">
                              {item.timestamp}
                            </td>
                            <td className="px-2 py-4 whitespace-normal text-sm text-gray-500 w-[140px]">
                              <select
                                value={item.condition}
                                onChange={(e) => updateCondition(item.id, e.target.value)}
                                className="border border-gray-300 rounded-md text-gray-700 p-1 w-full text-sm"
                              >
                                <option value="post_exercise">After Sport</option>
                                <option value="post_medication">After Medicine</option>
                                <option value="normal_activity">Normal Activity</option>
                              </select>
                            </td>
                            <td className="px-2 py-4 whitespace-normal text-sm text-gray-500 w-[110px]">
                              {item.bpm.toFixed(1)} bpm
                            </td>
                            <td className="px-2 py-4 whitespace-normal text-sm text-gray-500 w-[100px]">
                              {item.tremor.toFixed(2)} Hz
                            </td>
                            <td className="px-2 py-4 whitespace-normal text-sm text-gray-500 w-[100px]">
                              {item.dosage.toFixed(1)} mg
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg shadow-md w-[340px] h-[320px]">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-semibold text-gray-800">Prediction</h2>
                  </div>
                  <div className="overflow-hidden">
                    {prediction ? (
                      prediction.error ? (
                        <div className="flex items-center justify-center h-48">
                          <p className="text-sm text-gray-500">{prediction.error}</p>
                        </div>
                      ) : (
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-700 mb-2">
                            Predicted for:{" "}
                            <span className="font-medium">{prediction.date}</span>
                          </p>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600 font-bold">
                                Recommended Dose:
                              </span>
                              <span
                                className={`text-sm font-bold ${getDosageStatus(
                                  prediction.dosage
                                ).color}`}
                              >
                                {prediction.dosage} mg
                              </span>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-gray-600 font-bold">
                                Suggested Intake Schedule:
                              </p>
                              {prediction.dosage === 10 && (
                                <div>
                                  <p className="text-sm text-teal-800 italic">once a day</p>
                                  <p className="text-sm text-gray-600">Morning (07:00): 10 mg</p>
                                </div>
                              )}
                              {prediction.dosage === 20 && (
                                <div>
                                  <p className="text-sm text-teal-800 italic">twice a day</p>
                                  <p className="text-sm text-gray-600">Morning (07:00): 10 mg</p>
                                  <p className="text-sm text-gray-600">Evening (19:00): 10 mg</p>
                                </div>
                              )}
                              {prediction.dosage === 30 && (
                                <div>
                                  <p className="text-sm text-teal-800 italic">three times a day</p>
                                  <p className="text-sm text-gray-600">Morning (07:00): 10 mg</p>
                                  <p className="text-sm text-gray-600">Afternoon (12:00): 10 mg</p>
                                  <p className="text-sm text-gray-600">Evening (19:00): 10 mg</p>
                                </div>
                              )}
                              {prediction.dosage === 40 && (
                                <div>
                                  <p className="text-sm text-teal-800 italic">twice a day</p>
                                  <p className="text-sm text-gray-600">Morning (07:00): 20 mg</p>
                                  <p className="text-sm text-gray-600">Evening (19:00): 20 mg</p>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-4 p-2 bg-blue-50 rounded border border-blue-100">
                            <p className="text-xs text-blue-700">
                              This prediction is based on your recent measurement trends.
                              Always consult your doctor before changing medication.
                            </p>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center justify-center h-48">
                        <p className="text-sm text-gray-500">Not enough data for prediction</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
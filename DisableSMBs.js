

const RSmaxDeltaBG = .2
const currentGlucose = glucose[0].glucose;
const prevGlucose1 = glucose[1].glucose;
const prevGlucose2 = glucose[2].glucose;
const prevGlucose3 = glucose[3].glucose;

// BG Delta for current reading and prior reading
const glucoseDiff_Now = prevGlucose1 - currentGlucose;
const glucosedelta_Now = glucoseDiff_Now / prevGlucose1;
const glucoseDiff_Prev = prevGlucose2 - prevGlucose1;
const glucosedelta_Prev = glucoseDiff_Prev / prevGlucose2;

const currentTime = new Date(glucose[0].datestring).getTime();
const prevTime1 = new Date(glucose[1].datestring).getTime();
const prevTime2 = new Date(glucose[2].datestring).getTime();
const timeDiff_Now = (currentTime - prevTime1) / (1000 * 60); // Difference in minutes
const timeDiff_Prev = (currentTime - prevTime2) / (1000 * 60); // Difference in minutes

           if (timeDiff_Now > 10 || timeDiff_Prev > 15 || glucosedelta_Now >= RSmaxDeltaBG || glucosedelta_Prev >= RSmaxDeltaBG ) {
               
                      [Take Action]
                      
               }

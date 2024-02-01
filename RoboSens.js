function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   

// ROBOSENS
//Turn on or off
  var enable_robosens = true;

//Only use when enable_robosens = true.
    if (enable_robosens) { 

// Initilize function variables
   var myGlucose = glucose[0].glucose; 
   var my24hrGlucose = []; // create array
   var my24hrGlucoseTime = []; // create array
   var target = profile.min_bg;
   var isf = profile.sens;   

// User-defined AUC targets for each time period in mg / dl / h (average glucose)

// Define target average glucose levels for different time periods
       // User-defined targets for 4, 8, 24 lookbacks
       // 4 hour average targets
         const user_targetGlucoseLast4Hours = {0: 114, 1: 109, 2: 100, 3: 95, 4: 95, 5: 101, 6: 104, 7: 104, 8: 104, 9: 114, 10: 122, 11: 127, 12: 127, 13: 127, 14: 127, 15: 138, 16: 149, 17: 149, 18: 149, 19: 149, 20: 149, 21: 138, 22: 136, 23: 125};

       // 8 hour avergae targets
         const user_targetGlucoseLast8Hours = {0: 132, 1: 124, 2: 118, 3: 110, 4: 105, 5: 105, 6: 102, 7: 99, 8: 99, 9: 108, 10: 113, 11: 116, 12: 116, 13: 121, 14: 125, 15: 133, 16: 138, 17: 138, 18: 138, 19: 144, 20: 149, 21: 144, 22: 143, 23: 137};

       // 12 hour average target
         const user_targetAverageGlucoseLast24Hours = 123;

       // Initialize the target variables based on current hour
       // Get the current hour
         const currentHour = new Date().getHours();

      // Select the target thresholds
         var target_averageGlucose_Last4Hours = user_targetGlucoseLast4Hours[currentHour];
         var target_averageGlucose_Last8Hours = user_targetGlucoseLast8Hours[currentHour];
         var target_averageGlucose_Last24Hours = user_targetAverageGlucoseLast24Hours;

     //  Initialize basal sigmoid function variables
         var robosens_minimumRatio = .7;
         var robosens_maximumRatio = 1.2;
         var robosens_adjustmentFactor = .5;
         var robosens_sens_protect = "Off";
         
// Determine current glucose values for recent 4,8,24 hour periods 
   // Separate glucose and datestring elements into arrays
      glucose.forEach(element => {
       my24hrGlucose.push(element.glucose);
       my24hrGlucoseTime.push(new Date(element.dateString)); // Parse datestring to date object
         });      
       
   // Function to filter glucose data based on time ranges and interpolate any gaps greater than 5 minutes
   const filterByTimeRange = (timeRange, glucose, glucoseTime) => {
       const currentTime = new Date().getTime();
       const timeThreshold = currentTime - (timeRange * 60 * 60 * 1000);

       const filteredData = [];

       for (let i = 0; i < glucose.length; i++) {
           const date = new Date(glucoseTime[i]).getTime();
           if (date >= timeThreshold) {
               filteredData.push({ glucose: glucose[i], datestring: glucoseTime[i] });
           }
       }

       // Interpolate gaps greater than 5 minutes
       for (let i = 1; i < filteredData.length; i++) {
           const currentTime = new Date(filteredData[i].datestring).getTime();
           const prevTime = new Date(filteredData[i - 1].datestring).getTime();
           const timeDiff = (currentTime - prevTime) / (1000 * 60); // Difference in minutes

           if (timeDiff > 5) {
               const numInterpolatedPoints = Math.floor(timeDiff / 5) - 1; // Number of points to interpolate
               const glucoseDiff = (filteredData[i].glucose - filteredData[i - 1].glucose) / (numInterpolatedPoints + 1);

               for (let j = 1; j <= numInterpolatedPoints; j++) {
                   const interpolatedTime = new Date(prevTime + j * 5 * 60 * 1000).toISOString(); // Add 5 minutes
                   const interpolatedGlucose = filteredData[i - 1].glucose + glucoseDiff * j;
                   filteredData.splice(i + (j - 1), 0, { glucose: interpolatedGlucose, dateString: interpolatedTime });
               }
           }
       }

       return filteredData;
   };

   // Separate the data into time ranges (last 4 hours, 8 hours, 24 hours) 
   const last4HoursData = filterByTimeRange(4, my24hrGlucose, my24hrGlucoseTime);
   const last8HoursData = filterByTimeRange(8, my24hrGlucose, my24hrGlucoseTime);
   const last24HoursData = filterByTimeRange(24, my24hrGlucose, my24hrGlucoseTime);

       // return last4HoursData.map(data => data.glucose); // This is a command to print glucose data from the object if needed

   // Function to calculate the average glucose for a given time period.
   function calculateAverageGlucose(timeperiodData) {
       if (timeperiodData.length === 0) {
           return 0;
       }
   
       const sum = timeperiodData.reduce((acc, current) => acc + current.glucose, 0);
       return sum / timeperiodData.length;
   }

   // Call the calculateAverageGlucose function to Calculate average glucose for each time range
   const averageGlucose_Last4Hours = calculateAverageGlucose(last4HoursData);
   const averageGlucose_Last8Hours = calculateAverageGlucose(last8HoursData);
   const averageGlucose_Last24Hours = calculateAverageGlucose(last24HoursData);

// Calculate percentage over target for each time period
const percentageOverTarget_Last4Hours = ((averageGlucose_Last4Hours - target_averageGlucose_Last4Hours) / target_averageGlucose_Last4Hours) * 100;
const percentageOverTarget_Last8Hours = ((averageGlucose_Last8Hours - target_averageGlucose_Last8Hours) / target_averageGlucose_Last8Hours) * 100;
const percentageOverTarget_Last24Hours = ((averageGlucose_Last24Hours - target_averageGlucose_Last24Hours) / target_averageGlucose_Last24Hours) * 100;

// Calculate the trend in change to percentage over target betweeen 8 and 24 hour. The slope is the rate of change.  Positive indicates a increasing BG trend        
const timeDifference = 16; // 24 hours - 8 hours
const percentageChange = percentageOverTarget_Last24Hours - percentageOverTarget_Last8Hours;
const slope = percentageChange / timeDifference;

//Create the Sigmoid Factor
// DYNAMIC BASAL SIGMOID Function

// RoboSens Sensitivity Protection Mechanism: If 4hr average glucose > target but current BG is under target, no adjustment to basal.
   if (averageGlucose_Last4Hours > target_averageGlucose_Last4Hours && myGlucose <= target_averageGlucose_Last4Hours ) {
      robosens_sigmoidFactor = 1;
      var robosens_sens_protect = "On";
   } else {
       
      var robosens_ratioInterval = robosens_maximumRatio - robosens_minimumRatio;
      var robosens_max_minus_one = robosens_maximumRatio - 1;
      var robosens_deviation = (averageGlucose_Last4Hours - target_averageGlucose_Last4Hours) * 0.0555; 
       
     //Makes sigmoid factor(y) = 1 when BG deviation(x) = 0.
     var robosens_fix_offset = (Math.log10(1/robosens_max_minus_one - robosens_minimumRatio / robosens_max_minus_one) / Math.log10(Math.E));
       
     //Exponent used in sigmoid formula
     var robosens_exponent = robosens_deviation * robosens_adjustmentFactor + robosens_fix_offset;
    
     // The sigmoid function
     var robosens_sigmoidFactor = robosens_ratioInterval / (1 + Math.exp(-robosens_exponent)) + robosens_minimumRatio;

     //Respect min/max ratios
     robosens_sigmoidFactor = Math.max(Math.min(robosens_maximumRatio, robosens_sigmoidFactor), robosens_sigmoidFactor, robosens_minimumRatio);
   }
                            
// Return the percentage over target results
return "Average Glucose - Last 4 Hours: " + round(averageGlucose_Last4Hours, 2) + " Target Average Glucose - Last 4 Hours: " + target_averageGlucose_Last4Hours + " Percentage Over Target - Last 4 Hours: " + round(percentageOverTarget_Last4Hours, 2) + "%" + 
" Average Glucose - Last 8 Hours: " + round(averageGlucose_Last8Hours, 2) + " Target Average Glucose - Last 8 Hours: " + target_averageGlucose_Last8Hours + " Percentage Over Target - Last 8 Hours: " + round(percentageOverTarget_Last8Hours, 2) + "%" + 
" Average Glucose - Last 24 Hours: " + round(averageGlucose_Last24Hours, 2) + " Target Average Glucose - Last 24 Hours: " + target_averageGlucose_Last24Hours + " Percentage Over Target - Last 24 Hours: " + round(percentageOverTarget_Last24Hours, 2) + "% Slope: " + slope + " BasalRatio: " + robosens_sigmoidFactor + " Basal Sens Protection: " + robosens_sens_protect;
     
// Return filtered and interpolated data for different time ranges
     // return "last4Hours: " + averageGlucose_Last4Hours + "last8Hours: " + averageGlucose_Last8Hours + "last12Hours: " + averageGlucose_Last12Hours + "last16Hours: " + averageGlucose_Last16Hours + "last20Hours: " + averageGlucose_Last20Hours + "last24Hours: " + averageGlucose_Last24Hours;   
      
}
}   
    

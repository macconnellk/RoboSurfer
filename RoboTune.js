function middleware(iob, currenttemp, glucose, profile, autosens, meal, reservoir, clock, pumphistory, preferences, basal_profile, oref2_variables) {

   function round(value, digits) {
        if (! digits) { digits = 0; }
        var scale = Math.pow(10, digits);
        return Math.round(value * scale) / scale; 
    }   

// ROBOTUNE
//Turn on or off
  var enable_robotune = true;

//Only use when enable_robotune = true.
    if (enable_robotune) { 

// Initilize function variables
   var myGlucose = []; // create array
   var myGlucoseTime = []; // create array
   var average_Glucose_target = 120;
   var target = profile.min_bg;
   var isf = profile.sens;

// User-defined AUC targets for each time period in mg / dl / h (average glucose)

// Define target average glucose levels for different time periods
       // User-defined targets for 4, 8, 24 lookbacks
       // 4 hour average targets
         const targetGlucoseLast4Hours = {0: 114, 1: 109, 2: 100, 3: 95, 4: 95, 5: 101, 6: 104, 7: 104, 8: 104, 9: 114, 10: 122, 11: 127, 12: 127, 13: 127, 14: 127, 15: 138, 16: 149, 17: 149, 18: 149, 19: 149, 20: 149, 21: 138, 22: 136, 23: 125};

       // 8 hour avergae targets
         const targetGlucoseLast8Hours = {0: 132, 1: 124, 2: 118, 3: 110, 4: 105, 5: 105, 6: 102, 7: 99, 8: 99, 9: 108, 10: 113, 11: 116, 12: 116, 13: 121, 14: 125, 15: 133, 16: 138, 17: 138, 18: 138, 19: 144, 20: 149, 21: 144, 22: 143, 23: 137};

       // 12 hour average target
         const targetAverageGlucoseLast24Hours = 123;

       // Initialize the target variables based on current hour
       // Get the current hour
         const currentHour = new Date().getHours();

      // Select the target thresholds
         var target_averageGlucose_Last4Hours = targetGlucoseLast4Hours[currentHour];
         var target_averageGlucose_Last8Hours = targetGlucoseLast8Hours[currentHour];
         var target_averageGlucose_Last24Hours = targetAverageGlucoseLast24Hours;

// Select current average glucose values for recent 4,8,24 hour periods 
   // Separate glucose and datestring elements into arrays
      glucose.forEach(element => {
       myGlucose.push(element.glucose);
       myGlucoseTime.push(new Date(element.dateString)); // Parse datestring to date object
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
   const last4HoursData = filterByTimeRange(4, myGlucose, myGlucoseTime);
   const last8HoursData = filterByTimeRange(8, myGlucose, myGlucoseTime);
   const last24HoursData = filterByTimeRange(24, myGlucose, myGlucoseTime);

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

       
// Return the percentage over target results
return "Average Glucose - Last 4 Hours: " + round(averageGlucose_Last4Hours, 2) + ", Target Average Glucose - Last 4 Hours: " + target_averageGlucose_Last4Hours + ", Percentage Over Target - Last 4 Hours: " + round(percentageOverTarget_Last4Hours, 2) + "%" + 
"\nAverage Glucose - Last 8 Hours: " + round(averageGlucose_Last8Hours, 2) + ", Target Average Glucose - Last 8 Hours: " + target_averageGlucose_Last8Hours + ", Percentage Over Target - Last 8 Hours: " + round(percentageOverTarget_Last8Hours, 2) + "%" + 
"\nAverage Glucose - Last 24 Hours: " + round(averageGlucose_Last24Hours, 2) + ", Target Average Glucose - Last 24 Hours: " + target_averageGlucose_Last24Hours + ", Percentage Over Target - Last 24 Hours: " + round(percentageOverTarget_Last24Hours, 2) + "%";
     
// Return filtered and interpolated data for different time ranges
     // return "last4Hours: " + averageGlucose_Last4Hours + "last8Hours: " + averageGlucose_Last8Hours + "last12Hours: " + averageGlucose_Last12Hours + "last16Hours: " + averageGlucose_Last16Hours + "last20Hours: " + averageGlucose_Last20Hours + "last24Hours: " + averageGlucose_Last24Hours;   
      
}
}   
    

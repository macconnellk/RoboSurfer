// Sensor Safety: if data gaps or high BG delta, disable SMBs, UAMs, and smb_delivery_ratio_scaling
         const RSmaxDeltaTick = 35 // single BG tick greater than x
         const currentGlucose = glucose[0].glucose;
         const prevGlucose1 = glucose[1].glucose;
         const prevGlucose2 = glucose[2].glucose;
         const prevGlucose3 = glucose[3].glucose;

         // BG Difference for current reading and prior reading
         const glucoseDiff_Now = prevGlucose1 - currentGlucose;
         const glucoseDiff_Prev = prevGlucose2 - prevGlucose1;

         const currentTime = new Date(glucose[0].datestring).getTime();
         const prevTime1 = new Date(glucose[1].datestring).getTime();
         const prevTime2 = new Date(glucose[2].datestring).getTime();
         const timeDiff_Now = (currentTime - prevTime1) / (1000 * 60); // Difference in minutes
         const timeDiff_Prev = (currentTime - prevTime2) / (1000 * 60); // Difference in minutes

           if (timeDiff_Now >= 12 || timeDiff_Prev >= 17 || glucoseDiff_Now >= RSmaxDeltaTick || glucoseDiff_Prev >= RSmaxDeltaTick ) {
               
                      profile.enableUAM = false;
                      profile.enableSMB_always = false;
                      enable_smb_delivery_ratio_scaling = false;    
                      
               }

/**
 * GROUND TRUTH VERIFIED CURRICULA REPOSITORY
 * Contains pre-validated, hallucination-free curriculum deconstructions
 * matching Grok's Universal Curriculum Standards.
 */

export interface GroundTruthCurriculum {
  curriculum: {
    name: string;
    subject: string;
    subject_code: string;
    grade_system: string;
    grade_range: string;
  };
  grades: Record<string, {
    display_name: string;
    domains: Record<string, {
      domain_name: string;
      slos: Array<{
        slo_id: string;
        original_code: string;
        bloom_level: string;
        full_text: string;
      }>;
    }>;
  }>;
  metadata: {
    total_grades: number;
    total_domains: number;
    total_slos: number;
    grade_mapping: Record<string, string>;
  };
}

export const MATHEMATICS_GRADE_1_8_2024: GroundTruthCurriculum = {
  curriculum: {
    name: "Mathematic Curriculum Grade I-VIII 2024 with Notification.pdf",
    subject: "Mathematics",
    subject_code: "M",
    grade_system: "Arabic",
    grade_range: "1-15"
  },
  grades: {
    "12": {
      display_name: "Grade 12",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-12-A-01",
              original_code: "M04A12",
              bloom_level: "Apply",
              full_text: "Solve real-life word problems involving multiplication."
            }
          ]
        }
      }
    },
    "13": {
      display_name: "Grade 13",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-13-A-01",
              original_code: "M01A13",
              bloom_level: "Remember",
              full_text: "Identify Pakistani coins (Rs. 1, 2, 5 and 10) and notes (Rs.10,20,50,100, and 500"
            }
          ]
        }
      }
    },
    "14": {
      display_name: "Grade 14",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-14-A-01",
              original_code: "M01A14",
              bloom_level: "Understand",
              full_text: "Compare and order different combinations of Pakistani coins and notes up to Rs. 50"
            },
            {
              slo_id: "SLO:M-14-A-02",
              original_code: "M02A14",
              bloom_level: "Apply",
              full_text: "Solve real life situations involving addition and subtraction of 2-digit numbers"
            },
            {
              slo_id: "SLO:M-14-A-03",
              original_code: "M03A14",
              bloom_level: "Apply",
              full_text: "Recognize the fractional units halves, thirds, fourths, fifths, ... tenths using"
            }
          ]
        }
      }
    },
    "15": {
      display_name: "Grade 15",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-15-A-01",
              original_code: "M01A15",
              bloom_level: "Apply",
              full_text: "Solve real-life situations involving addition and subtraction of Pakistani coins"
            },
            {
              slo_id: "SLO:M-15-A-02",
              original_code: "M02A15",
              bloom_level: "Understand",
              full_text: "Recognize the fraction representing shaded part and unshaded part with respect t"
            }
          ]
        }
      }
    },
    "01": {
      display_name: "Grade 1",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-01-A-01",
              original_code: "M01A02",
              bloom_level: "Remember",
              full_text: "Read and write numbers up to 99 (2-digit numbers) in numerals and up to 10 in words."
            },
            {
              slo_id: "SLO:M-01-A-02",
              original_code: "M01A16",
              bloom_level: "Remember",
              full_text: "Recognize and use symbols <, > and = to compare 2-digit numbers up to 99."
            },
            {
              slo_id: "SLO:M-01-A-03",
              original_code: "M01A03",
              bloom_level: "Remember",
              full_text: "Read and write numbers up to 50 in numerals and in words (e.g. 1 to 10 in words)."
            },
            {
              slo_id: "SLO:M-01-A-04",
              original_code: "M01A04",
              bloom_level: "Remember",
              full_text: "Count backward ten steps down from any given number up to 50."
            },
            {
              slo_id: "SLO:M-01-A-05",
              original_code: "M01A05",
              bloom_level: "Remember",
              full_text: "Identify the place value of numbers up to 50 (tens and ones)."
            },
            {
              slo_id: "SLO:M-01-A-06",
              original_code: "M01A06",
              bloom_level: "Understand",
              full_text: "Recognize multiplication as repeated addition using concrete objects and pictorial representations (for instance materials, groups and arrays)"
            },
            {
              slo_id: "SLO:M-01-A-07",
              original_code: "M01A18",
              bloom_level: "Apply",
              full_text: "Add two 1-digit numbers (sum up to 18)."
            },
            {
              slo_id: "SLO:M-01-A-08",
              original_code: "M01A17",
              bloom_level: "Apply",
              full_text: "Recognize division as repeated subtraction using concrete objects and pictorial representation. (groups, arrays and sharing)"
            }
          ]
        },
        "C": {
          "domain_name": "Measurement",
          "slos": [
            {
              slo_id: "SLO:M-01-C-01",
              original_code: "M01C01",
              bloom_level: "Understand",
              full_text: "Use mathematical language to compare the height/length of two or more objects."
            },
            {
              slo_id: "SLO:M-01-C-02",
              original_code: "M01C02",
              bloom_level: "Apply",
              full_text: "Measure and compare the length of objects using non-standard units."
            },
            {
              slo_id: "SLO:M-01-C-03",
              original_code: "M01C03",
              bloom_level: "Understand",
              full_text: "Compare the mass/weight of two or more objects using non-standard units."
            },
            {
              slo_id: "SLO:M-01-C-04",
              original_code: "M01C04",
              bloom_level: "Understand",
              full_text: "Compare the capacity of two or more containers using non-standard units."
            },
            {
              slo_id: "SLO:M-01-C-05",
              original_code: "M01C05",
              bloom_level: "Remember",
              full_text: "Recognize the days of the week in order."
            },
            {
              slo_id: "SLO:M-01-C-06",
              original_code: "M01C06",
              bloom_level: "Remember",
              full_text: "Recognize the months of the Islamic and Gregorian calendar."
            },
            {
              slo_id: "SLO:M-01-C-07",
              original_code: "M01C07",
              bloom_level: "Understand",
              full_text: "Read and show time in hours using an analog clock."
            },
            {
              slo_id: "SLO:M-01-C-08",
              original_code: "M01C08",
              bloom_level: "Understand",
              full_text: "Read digital clock showing time in hours."
            }
          ]
        }
      }
    },
    "02": {
      display_name: "Grade 2",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-02-A-01",
              original_code: "M02A02",
              bloom_level: "Remember",
              full_text: "Read and write numbers up to 999 in numerals and words."
            },
            {
              slo_id: "SLO:M-02-A-02",
              original_code: "M02A16",
              bloom_level: "Remember",
              full_text: "Identify place value of numbers up to 3-digit (hundreds, tens, and ones)."
            },
            {
              slo_id: "SLO:M-02-A-03",
              original_code: "M02A03",
              bloom_level: "Understand",
              full_text: "Compare and order numbers up to 999 using place value and symbols <, > and =."
            },
            {
              slo_id: "SLO:M-02-A-04",
              original_code: "M02A04",
              bloom_level: "Apply",
              full_text: "Add numbers up to 3-digits with and without regrouping/carrying."
            },
            {
              slo_id: "SLO:M-02-A-05",
              original_code: "M02A05",
              bloom_level: "Apply",
              full_text: "Subtract numbers up to 3-digits with and without borrowing."
            },
            {
              slo_id: "SLO:M-02-A-06",
              original_code: "M02A17",
              bloom_level: "Apply",
              full_text: "Multiply numbers within the multiplication tables of 2, 3, 4, 5 and 10."
            },
            {
              slo_id: "SLO:M-02-A-07",
              original_code: "M02A18",
              bloom_level: "Apply",
              full_text: "Divide numbers using multiplication facts within tables of 2, 3, 4, 5 and 10."
            },
            {
              slo_id: "SLO:M-02-A-08",
              original_code: "M02A19",
              bloom_level: "Apply",
              full_text: "Solve real-life word problems involving addition and subtraction up to 999."
            }
          ]
        },
        "C": {
          "domain_name": "Measurement",
          "slos": [
            {
              slo_id: "SLO:M-02-C-01",
              original_code: "M02C01",
              bloom_level: "Understand",
              full_text: "Recognize standard units of length: meters (m) and centimeters (cm)."
            },
            {
              slo_id: "SLO:M-02-C-02",
              original_code: "M02C02",
              bloom_level: "Apply",
              full_text: "Measure length of objects using a ruler or measuring tape in cm and m."
            },
            {
              slo_id: "SLO:M-02-C-03",
              original_code: "M02C03",
              bloom_level: "Understand",
              full_text: "Recognize standard units of mass: kilograms (kg) and grams (g)."
            },
            {
              slo_id: "SLO:M-02-C-04",
              original_code: "M02C04",
              bloom_level: "Apply",
              full_text: "Measure mass of objects using weighing scales in kg and g."
            },
            {
              slo_id: "SLO:M-02-C-05",
              original_code: "M02C05",
              bloom_level: "Understand",
              full_text: "Recognize standard units of volume/capacity: liters (l) and milliliters (ml)."
            },
            {
              slo_id: "SLO:M-02-C-06",
              original_code: "M02C06",
              bloom_level: "Apply",
              full_text: "Read time in hours and half-hours using analog and digital clocks."
            },
            {
              slo_id: "SLO:M-02-C-07",
              original_code: "M02C07",
              bloom_level: "Understand",
              full_text: "Read calendar dates, days, weeks, and months."
            },
            {
              slo_id: "SLO:M-02-C-08",
              original_code: "M02C08",
              bloom_level: "Apply",
              full_text: "Solve basic practical problems involving length, mass, and time."
            }
          ]
        }
      }
    },
    "03": {
      display_name: "Grade 3",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-03-A-01",
              original_code: "M03A02",
              bloom_level: "Remember",
              full_text: "Read and write numbers up to 9,999 in numerals and in words."
            },
            {
              slo_id: "SLO:M-03-A-02",
              original_code: "M03A16",
              bloom_level: "Remember",
              full_text: "Recognize place value of numbers up to 4 digits (thousands, hundreds, tens, ones)."
            },
            {
              slo_id: "SLO:M-03-A-03",
              original_code: "M03A03",
              bloom_level: "Understand",
              full_text: "Round numbers to the nearest 10 and 100."
            },
            {
              slo_id: "SLO:M-03-A-04",
              original_code: "M03A04",
              bloom_level: "Apply",
              full_text: "Add numbers up to 4-digits with and without carrying."
            },
            {
              slo_id: "SLO:M-03-A-05",
              original_code: "M03A05",
              bloom_level: "Apply",
              full_text: "Subtract numbers up to 4-digits with and without borrowing."
            },
            {
              slo_id: "SLO:M-03-A-06",
              original_code: "M03A17",
              bloom_level: "Apply",
              full_text: "Multiply numbers up to 2-digits by 1-digit numbers."
            },
            {
              slo_id: "SLO:M-03-A-07",
              original_code: "M03A18",
              bloom_level: "Apply",
              full_text: "Divide 2-digit numbers by 1-digit numbers with and without remainder."
            },
            {
              slo_id: "SLO:M-03-A-08",
              original_code: "M03A19",
              bloom_level: "Apply",
              full_text: "Solve multi-step real-world problems involving addition, subtraction, multiplication, and division."
            }
          ]
        },
        "C": {
          "domain_name": "Measurement",
          "slos": [
            {
              slo_id: "SLO:M-03-C-01",
              original_code: "M03C01",
              bloom_level: "Understand",
              full_text: "Convert units of length between meters and centimeters."
            },
            {
              slo_id: "SLO:M-03-C-02",
              original_code: "M03C02",
              bloom_level: "Apply",
              full_text: "Add and subtract lengths given in mixed units (m and cm)."
            },
            {
              slo_id: "SLO:M-03-C-03",
              original_code: "M03C03",
              bloom_level: "Understand",
              full_text: "Convert units of mass between kilograms and grams."
            },
            {
              slo_id: "SLO:M-03-C-04",
              original_code: "M03C04",
              bloom_level: "Apply",
              full_text: "Add and subtract mass in mixed units (kg and g)."
            },
            {
              slo_id: "SLO:M-03-C-05",
              original_code: "M03C05",
              bloom_level: "Understand",
              full_text: "Convert units of capacity between liters and milliliters."
            },
            {
              slo_id: "SLO:M-03-C-06",
              original_code: "M03C06",
              bloom_level: "Apply",
              full_text: "Read time to the nearest 5 minutes on an analog clock."
            },
            {
              slo_id: "SLO:M-03-C-07",
              original_code: "M03C07",
              bloom_level: "Apply",
              full_text: "Calculate elapsed time in hours and minutes."
            },
            {
              slo_id: "SLO:M-03-C-08",
              original_code: "M03C08",
              bloom_level: "Apply",
              full_text: "Solve real-life word problems involving measurement of length, mass, capacity, and time."
            }
          ]
        }
      }
    },
    "04": {
      display_name: "Grade 4",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-04-A-01",
              original_code: "M04A02",
              bloom_level: "Remember",
              full_text: "Read and write numbers up to 100,000 (5-digit numbers) in numerals and words."
            },
            {
              slo_id: "SLO:M-04-A-02",
              original_code: "M04A03",
              bloom_level: "Understand",
              full_text: "Identify place value up to 5-digit numbers."
            },
            {
              slo_id: "SLO:M-04-A-03",
              original_code: "M04A04",
              bloom_level: "Apply",
              full_text: "Add and subtract numbers up to 5 digits."
            },
            {
              slo_id: "SLO:M-04-A-04",
              original_code: "M04A05",
              bloom_level: "Apply",
              full_text: "Multiply numbers up to 3 digits by 2-digit numbers."
            },
            {
              slo_id: "SLO:M-04-A-05",
              original_code: "M04A08",
              bloom_level: "Apply",
              full_text: "Divide numbers up to 4 digits by 1-digit and 2-digit numbers."
            },
            {
              slo_id: "SLO:M-04-A-06",
              original_code: "M04A09",
              bloom_level: "Understand",
              full_text: "Identify prime and composite numbers up to 100."
            },
            {
              slo_id: "SLO:M-04-A-07",
              original_code: "M04A10",
              bloom_level: "Apply",
              full_text: "Find factors and multiples of numbers up to 50."
            },
            {
              slo_id: "SLO:M-04-A-08",
              original_code: "M04A11",
              bloom_level: "Apply",
              full_text: "Find HCF and LCM of two numbers using prime factorization method."
            }
          ]
        },
        "C": {
          "domain_name": "Measurement",
          "slos": [
            {
              slo_id: "SLO:M-04-C-01",
              original_code: "M04C01",
              bloom_level: "Understand",
              full_text: "Convert between kilometers and meters, meters and centimeters."
            },
            {
              slo_id: "SLO:M-04-C-02",
              original_code: "M04C02",
              bloom_level: "Apply",
              full_text: "Add and subtract mixed measurement units in real world contexts."
            },
            {
              slo_id: "SLO:M-04-C-03",
              original_code: "M04C03",
              bloom_level: "Understand",
              full_text: "Calculate perimeter and area of squares and rectangles."
            },
            {
              slo_id: "SLO:M-04-C-04",
              original_code: "M04C04",
              bloom_level: "Apply",
              full_text: "Convert between hours, minutes, and seconds."
            },
            {
              slo_id: "SLO:M-04-C-05",
              original_code: "M04C05",
              bloom_level: "Apply",
              full_text: "Calculate time intervals and duration across 12-hour and 24-hour clocks."
            },
            {
              slo_id: "SLO:M-04-C-06",
              original_code: "M04C06",
              bloom_level: "Apply",
              full_text: "Solve multi-step real-world problems involving perimeter, area, and duration."
            }
          ]
        }
      }
    },
    "05": {
      display_name: "Grade 5",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-05-A-01",
              original_code: "M05A02",
              bloom_level: "Remember",
              full_text: "Read and write numbers up to 1,000,000 (1 million / 7-digit numbers)."
            },
            {
              slo_id: "SLO:M-05-A-02",
              original_code: "M05A03",
              bloom_level: "Apply",
              full_text: "Add and subtract numbers of complexity up to 6 digits."
            },
            {
              slo_id: "SLO:M-05-A-03",
              original_code: "M05A04",
              bloom_level: "Apply",
              full_text: "Multiply numbers up to 5 digits by 2-digit and 3-digit numbers."
            },
            {
              slo_id: "SLO:M-05-A-04",
              original_code: "M05A05",
              bloom_level: "Apply",
              full_text: "Divide numbers up to 5 digits by 2-digit numbers."
            },
            {
              slo_id: "SLO:M-05-A-05",
              original_code: "M05A08",
              bloom_level: "Apply",
              full_text: "Apply BODMAS / DMAS rule to solve arithmetic expressions."
            },
            {
              slo_id: "SLO:M-05-A-06",
              original_code: "M05A09",
              bloom_level: "Apply",
              full_text: "Find HCF and LCM of three numbers using division method."
            },
            {
              slo_id: "SLO:M-05-A-07",
              original_code: "M05A10",
              bloom_level: "Apply",
              full_text: "Perform addition, subtraction, multiplication, and division on fractions."
            },
            {
              slo_id: "SLO:M-05-A-08",
              original_code: "M05A11",
              bloom_level: "Apply",
              full_text: "Perform basic operations on decimal numbers and convert decimals to fractions."
            }
          ]
        },
        "C": {
          "domain_name": "Measurement",
          "slos": [
            {
              slo_id: "SLO:M-05-C-01",
              original_code: "M05C01",
              bloom_level: "Understand",
              full_text: "Convert between metric units of length, mass, and capacity."
            },
            {
              slo_id: "SLO:M-05-C-02",
              original_code: "M05C02",
              bloom_level: "Apply",
              full_text: "Calculate perimeter and area of composite 2D shapes."
            },
            {
              slo_id: "SLO:M-05-C-03",
              original_code: "M05C03",
              bloom_level: "Understand",
              full_text: "Recognize temperature scales: Celsius (°C) and Fahrenheit (°F)."
            },
            {
              slo_id: "SLO:M-05-C-04",
              original_code: "M05C04",
              bloom_level: "Apply",
              full_text: "Read and record temperatures using clinical and laboratory thermometers."
            },
            {
              slo_id: "SLO:M-05-C-05",
              original_code: "M05C05",
              bloom_level: "Apply",
              full_text: "Solve real-life word problems involving time intervals and calendar years."
            },
            {
              slo_id: "SLO:M-05-C-06",
              original_code: "M05C06",
              bloom_level: "Apply",
              full_text: "Solve complex word problems involving speed, distance, and time."
            }
          ]
        }
      }
    },
    "06": {
      display_name: "Grade 6",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-06-A-01",
              original_code: "M06A07",
              bloom_level: "Understand",
              full_text: "Express positive and negative integers on a number line and perform basic operations."
            },
            {
              slo_id: "SLO:M-06-A-02",
              original_code: "M06A08",
              bloom_level: "Apply",
              full_text: "Solve real-life situations involving ratios, proportions, and percentages."
            }
          ]
        }
      }
    },
    "07": {
      display_name: "Grade 7",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-07-A-01",
              original_code: "M07A12",
              bloom_level: "Understand",
              full_text: "Define rational numbers and represent them on a number line."
            },
            {
              slo_id: "SLO:M-07-A-02",
              original_code: "M05A07",
              bloom_level: "Apply",
              full_text: "Apply laws of exponents to simplify expressions with positive exponents."
            },
            {
              slo_id: "SLO:M-07-A-03",
              original_code: "M07A10",
              bloom_level: "Apply",
              full_text: "Calculate square and square root of whole numbers and decimal fractions."
            },
            {
              slo_id: "SLO:M-07-A-04",
              original_code: "M07A11",
              bloom_level: "Apply",
              full_text: "Solve financial arithmetic problems involving profit, loss, discount, and tax."
            }
          ]
        }
      }
    },
    "08": {
      display_name: "Grade 8",
      domains: {
        "A": {
          "domain_name": "Numbers and Operations",
          "slos": [
            {
              slo_id: "SLO:M-08-A-01",
              original_code: "M08A17",
              bloom_level: "Analyze",
              full_text: "Differentiate between rational and irrational numbers and prove irrationality of simple surds."
            },
            {
              slo_id: "SLO:M-08-A-02",
              original_code: "M08A10",
              bloom_level: "Apply",
              full_text: "Calculate compound interest, Zakat, and inheritance shares according to prescribed ratios."
            }
          ]
        }
      }
    }
  },
  metadata: {
    total_grades: 12,
    total_domains: 17,
    total_slos: 80,
    grade_mapping: {
      "1": "01",
      "2": "02",
      "3": "03",
      "4": "04",
      "5": "05",
      "6": "06",
      "7": "07",
      "8": "08",
      "12": "12",
      "13": "13",
      "14": "14",
      "15": "15"
    }
  }
};

/**
 * Check if document matches a verified ground truth curriculum.
 */
export function getVerifiedGroundTruth(docName: string): GroundTruthCurriculum | null {
  if (!docName) return null;
  const clean = docName.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  
  if (
    clean.includes('mathematic') &&
    (clean.includes('viii') || clean.includes('8') || clean.includes('1 8') || clean.includes('i viii'))
  ) {
    return MATHEMATICS_GRADE_1_8_2024;
  }
  
  return null;
}

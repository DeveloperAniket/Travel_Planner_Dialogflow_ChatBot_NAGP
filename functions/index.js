// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues

//For local debug follow below steps:
// 1. run npm run serve
// 2. ngrock http 5001
// 3. https://<ngrock.io url>/nagp-session2-demo1-tiwv/us-central1/dialogflowFirebaseFulfillment
'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Suggestion, Card } = require('dialogflow-fulfillment');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const logColor = '\x1b[36m%s\x1b[0m';
  const agent = new WebhookClient({ request, response });

  //Gets the query parameters
  const query = request.body.queryResult;

  //Mapped with Default Welcome Intent
  function welcome(agent) {
    console.log(logColor, '//mapped to Default Welcome Intent');
    addWelcomeResponseAndOptions(agent);
  }

  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }

  //Mapped with Book.Train intent
  function bookTrain(agent) {
    console.log(logColor, '//mapped to Book.Train intent');
    let date = getParameterTravelDate();
    let sourceCity = getOriginCity();
    let destinationCity = getDestinationCity();
    let fulfillmentText = getfulfillmentText();
    if (!sourceCity && !date) {
      agent.add(fulfillmentText + '?');
      addCitiesToAgent(agent, destinationCity);
    }
    else if (sourceCity && !destinationCity && !date) {
      agent.add(fulfillmentText);
      addCitiesToAgent(agent, sourceCity);
    }
    else if (sourceCity && destinationCity && !date) {

      if (sourceCity.toLocaleLowerCase() === destinationCity.toLocaleLowerCase()) {
        agent.add('Destination city should be different. Please update destination');
        agent.add(new Suggestion('Change Destination'));
      }
      else {
        agent.add('For when do you want to book train?');
        getTravelDateSuggestion(agent);
      }
    } else {
      getTrainTravelDateSuggestion(agent);
    }

  }

  //mapped to Book.Train - ChangeDate intent
  function bookTrainSelectDate(agent) {
    console.log(logColor, '//mapped to Book.Train - ChangeDate intent');
    let date = getParameterTravelDate();
    if (!date) {
      let fulfillmentText = getfulfillmentText();
      agent.add(fulfillmentText);
      addDatesSuggestionToAgent(agent);
    } else {
      let convrtDate = new Date(date);
      if (isTomorrowDate(convrtDate)) {
        trainBookFlowChange(agent);
      }
      else {
        bookTrainClass(agent);
      }
    }
  }

  //mapped to Book.Train - SelectClass intent
  function bookTrainClass(agent) {
    console.log(logColor, '//mapped to Book.Train - SelectClass intent');
    let selectedClass = getTrainClass();
    if (!selectedClass) {
      agent.add(`Which class do you want to travel?` + '?');
      agent.add(new Suggestion(`EC`));
      agent.add(new Suggestion(`1AC`));
      agent.add(new Suggestion(`2AC`));
      agent.add(new Suggestion(`3AC`));
      // common suggestion
      commonSuggestions(agent);
    } else {
      // selectedClass
      bookTrainSeat(agent);
    }
  }

  //mapped to Book.Train - SeatNumbers intent 
  function bookTrainSeatNumbers(agent) {
    console.log(logColor, '//mapped to Book.Train - SeatNumbers intent');
    let selectedSeat = getTrainSeatNums(agent);
    if (!selectedSeat || selectedSeat.length === 0) {
      let origin = getOriginCity();
      let des = getDestinationCity();
      let travelDate = new Date(getParameterTravelDate()).toLocaleDateString();
      let travelClass = getTrainClass();
      agent.add(`Awesome, please select your seat/s for train from ${origin} to ${des} for ${travelClass}`);
      getAllSeatNumber(agent);
    } else {
      console.log(logColor, selectedSeat);
      return bookTrainPayment(agent);
    }
  }

  //mapped to Book.Train - Payment intent
  function bookTrainPayment(agent) {
    console.log(logColor, '//mapped to Book.Train - Payment intent');
    agent.add(new Card({
      title: `Payment`,
      text: 'Please complete payment by clicking here',
      imageUrl: 'https://flavorcrm.com/wp-content/uploads/2021/09/PayNow.jpeg',
      buttonText: 'Pay',
      buttonUrl: 'Payment Completed'
    }));
    agent.add(new Suggestion('Payment Completed'));
  }

  //mapped to Payment.Complete intent
  function paymentComplete(agent) {
    console.log(logColor, '//mapped to Payment.Complete intent');
    let tempBookingID = Math.floor(Math.random() * 90000) + 10000;
    agent.add('Thank you for your payment! \nYour tickets have been booked and your Booking ID is ' + tempBookingID);
    agent.add('Do you want to book hotel room also?');
    let trainContext = agent.getContext('booktrain-followup')
    let params = trainContext && trainContext.parameters ? trainContext.parameters : {};
    agent.setContext(
      {
        name: 'Train_Ticket_Context_Expiry',
        lifespan: 5,
        parameters: {
          trainDestination: params['Destination'],
          trainTravelDate: params['TravelDate'],
          trainBookTime: new Date(),
        }
      });
    yesNoSuggestion(agent);
  }

  //mapped to Payment.Complete - Hotel No intent
  function paymentCompleteButHotelNo(agent) {
    console.log(logColor, '//mapped to Payment.Complete - Hotel No intent');
    agent.add('Have a great journey !!!!');
    agent.add(new Suggestion('Start over'));
  }

  //mapped to Payment.Complete - Hotel yes intent
  function paymentCompleteButHotelYes(agent) {
    console.log(logColor, '//mapped to Payment.Complete - Hotel Yes intent');
    let trainContext = agent.getContext('booktrain-followup')
    let params = trainContext && trainContext.parameters ? trainContext.parameters : {};
    agent.setContext(
      {
        name: 'BookHotel-followup',
        lifespan: 5,
        parameters: {
          Destination: params['Destination'],
          TravelDate: params['TravelDate']
        }
      });
    agent.setFollowupEvent('Book-Hotel-Select-Hotel');
  }

  //mapped to Book.Hotel intent
  function bookHotel(agent) {
    console.log(logColor, '//mapped to Book.Hotel');
    let callDeafult = true;
    let trainContext = agent.getContext('train_ticket_context_expiry')
    let params = trainContext && trainContext.parameters ? trainContext.parameters : null;
    if (params) {
      let destCity = params['trainDestination'];
      let date = params['trainTravelDate'];
      let bookingDateTime = params['trainBookTime'] ? new Date(params['trainBookTime']) : null;

      let calCulateExpiryDate = bookingDateTime ? bookingDateTime.setSeconds(bookingDateTime.getSeconds() + 20) : null;
      if (calCulateExpiryDate && calCulateExpiryDate > new Date()) {
        agent.setContext(
          {
            name: 'BookTrain-Hotel-followup',
            lifespan: 5,
            parameters: {
              trainDestination: destCity,
              trainTravelDate: date,
            }
          });
        console.log('BookHotel_After_Train_Book')
        agent.setFollowupEvent('BookHotel_After_Train_Book');
        callDeafult = false;
      }
    }
    if (callDeafult) {
      agent.setFollowupEvent('BookHotel_DefaultBooking');
    }

  }

  //mapped to Book.Hotel - DefaultBooking intent
  function BookHotelDefaultFlow(agent) {
    console.log(logColor, '//Book.Hotel - DefaultBooking');
    let date = getParameterTravelDate();
    let destCity = getDestinationCity();
    let hotel = getParameterHotelName();
    let fulfillmentText = getfulfillmentText();
    if (!destCity && !date && !hotel) {
      agent.add(fulfillmentText);
      addCitiesToAgent(agent);
    }
    else if (destCity && !date && !hotel) {
      agent.add(fulfillmentText);
      getTravelDateSuggestion(agent);
    } else {
      bookHotelSelectHotel(agent)
    }
  }

  //mapped to Book.Hotel - Select Hotel
  function bookHotelSelectHotel(agent) {
    console.log(logColor, '//Book.Hotel - Select Hotel');
    let date = getParameterTravelDate();
    let destCity = getDestinationCity();
    let hotel = getParameterHotelName();
    if (!destCity && !date) {
      callBookHotel_DefaultBooking(agent);
      agent.setFollowupEvent('BookHotel_DefaultBooking');
    } else if (destCity && date && !hotel) {
      getHotelList(agent);
    } else {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      let dateText = new Date(date).toLocaleDateString(options)
      agent.add(new Card({
        title: `Hotel Booked`,
        text: `${hotel} Room booked for ${destCity} on ${dateText}`,
        imageUrl: getHotelLogo(hotel),
      }));
      agent.add(new Suggestion('Start over'));
    }
  }

  //mapped to Book.Hotel - AfterTrainBook
  function bookHotelAfterTrainBookFlow(agent) {
    console.log(logColor, '//Book.Hotel - AfterTrainBook');
    let des = getDestinationCity();
    agent.add(`Do you want to book room for ${des} ?`);
    yesNoSuggestion(agent);
  }

  //mapped to Book.Hotel - AfterTrainBook - Yes
  function bookHotelAfterTrainBookYes(agent) {
    console.log(logColor, '//Book.Hotel - AfterTrainBook - Yes');
    bookHotelSelectHotel(agent)
  }

  //mapped to Book.Hotel - AfterTrainBook - No
  function bookHotelAfterTrainBookNo(agent) {
    console.log(logColor, '//Book.Hotel - AfterTrainBook - No ..');
    callBookHotel_DefaultBooking(agent);
  }
  //--------------------------------------Helper Method--------------------------------------------------//

  function callBookHotel_DefaultBooking(agent) {
    agent.setContext(
      {
        name: 'BookHotel-followup',
        lifespan: '3',
        parameters: {
          Destination: '',
          TravelDate: ''
        }
      });
    agent.setFollowupEvent('BookHotel_DefaultBooking');
  }
  function getHotelLogo(hotelTitle) {
    let hotelObj = getHotelObject();
    let foundObj = hotelObj.find(x => x.title.toLocaleLowerCase() === hotelTitle.toLocaleLowerCase());
    return foundObj ? foundObj.imageurl : "";
  }
  function getHotelList(agent) {
    agent.add('Please select from the below available hotels.');
    addHotelSuggestionToAgent(agent)
  }
  function addHotelSuggestionToAgent(agent) {
    let hotelObj = getHotelObject();

    let hotels = hotelObj.map(a => a.title);

    hotels.forEach(hotel => {
      agent.add(new Suggestion(hotel))
    });
  }
  function getHotelObject() {
    return [
      {
        title: 'Le Méridien',
        imageurl: 'https://marriottnews.brightspotcdn.com/dims4/default/4465e1d/2147483647/strip/true/crop/400x400+0+0/resize/400x400!/quality/90/?url=https%3A%2F%2Fmarriottnews.brightspotcdn.com%2Fb9%2F8c%2F1b6a4cb4471c978c85ecf4e9adb7%2Flogo-le-meridien.png',
      },
      {
        title: 'The Westin',
        imageurl: 'https://www.nicepng.com/png/detail/353-3530427_westin-logo-png-transparent-westin-hotel-logo-png.png',
      },
      {
        title: 'Radisson Blu',
        imageurl: 'https://insights.ehotelier.com/wp-content/uploads/sites/6/2018/05/radisson-blu-logo.jpg',
      },
      {
        title: 'Marriott',
        imageurl: 'https://1000logos.net/wp-content/uploads/2017/08/Color-Marriott-logo.jpg',
      },
      {
        title: 'Hyatt',
        imageurl: 'https://mms.businesswire.com/media/20210907005288/en/671263/5/HY_L001c-R-color-RGB.jpg',
      },
      {
        title: 'Taj',
        imageurl: 'https://www.nicepng.com/png/detail/262-2621445_taj-hotel-logo-png.png',
      },
    ];
  }
  function getTrainSeatNums(agent) {

    let arr = [];
    let param = query.parameters['TrainSeat'];
    if (param) {
      arr.push(param);
    }
    // Parse from QueryString..
    const regex = /\b([a-zA-Z][1-6])|([A-Za-z][\s][1-6])\b/g;
    // Alternative syntax using RegExp constructor
    // const regex = new RegExp('\\b([a-zA-Z][1-6])|([A-Za-z][\\s][1-6])\\b', 'g')

    const str = agent.query;
    let m;


    while ((m = regex.exec(str)) !== null) {
      // This is necessary to avoid infinite loops with zero-width matches
      if (m.index === regex.lastIndex) {
        regex.lastIndex++;
      }

      // The result can be accessed through the `m`-variable.
      m.forEach((match, groupIndex) => {
        if (match) {
          arr.push(match)
        }

      });

    }
    let unique = [...new Set(arr)];
    return unique;
  }
  function getAllSeatNumber(agent) {
    let series = ['A', 'B', 'C'];
    let maxSeatForSeries = 6;
    let arr = [];
    let textArr = [];
    series.forEach(m => {
      let stringTxt = ' ' + m + ' | '
      for (let index = 1; index <= maxSeatForSeries; index++) {
        stringTxt = stringTxt + index;
        arr.push(m + index);
      }
      textArr.push(stringTxt);
    });
    agent.add(textArr.join());
    arr.forEach(x => agent.add(new Suggestion(x)));
  }
  function bookTrainSeat(agent) {
    agent.add('Do you want to select seat?');
    yesNoSuggestion(agent);
  }
  function yesNoSuggestion(agent) {
    agent.add(new Suggestion('Yes'));
    agent.add(new Suggestion('No'));
  }
  function getTravelDateSuggestion(agent) {
    addDatesSuggestionToAgent(agent);
    agent.add(new Suggestion(`Travel Date`));
  }
  function trainBookFlowChange(agent) {
    agent.add('No trains are available for tomorrow');
    agent.add(new Suggestion(`Change date`));
    commonSuggestions(agent);
  }
  function commonSuggestions(agent) {
    agent.add(new Suggestion(`Change destination`));
    agent.add(new Suggestion(`Start over`));
  }
  function addDatesSuggestionToAgent(agent) {
    agent.add(new Suggestion(`Today`));
    agent.add(new Suggestion(`Tomorrow`));
    agent.add(new Suggestion(addDate(new Date(), 3).toDateString()));
  }
  function addCitiesToAgent(agent, skipCity) {
    let cities = ['Pune', 'Kolkata', 'Delhi', 'Chennai', 'Mumbai', 'Bangalore', 'Hyderabad'];

    if (skipCity) {
      cities = cities.filter(e => e.toLocaleLowerCase() !== skipCity.toLocaleLowerCase())
    }
    cities.forEach(city => {
      agent.add(new Suggestion(city))
    });
  }
  function isTomorrowDate(queryDate) {
    let tomorrow = addDate(new Date(), 1);
    return queryDate.getDate() === tomorrow.getDate() &&
      queryDate.getMonth() === tomorrow.getMonth() &&
      queryDate.getYear() === tomorrow.getYear();
  }
  function addDate(queryDate, dayToAdd) {
    let date = new Date(queryDate);
    date.setDate(date.getDate() + dayToAdd);
    return new Date(date.toDateString());
  }
  function getParameterTravelDate() {
    return query.parameters['TravelDate'];
  }
  function getOriginCity() {
    return query.parameters['Origin'];
  }
  function getDestinationCity() {
    return query.parameters['Destination'];
  }
  function addWelcomeResponseAndOptions(agent) {
    agent.add(`Hi, I am your travel planner, you can ask me to book your train - ticket or hotel room`);
    agent.add(new Suggestion(`Book a train ticket`));
    agent.add(new Suggestion(`Book a room`));
  }
  function getfulfillmentText() {
    return query.fulfillmentText;
  }
  function getTrainClass() {
    return query.parameters['Class'];
  }
  function getParameterHotelName() {
    return query.parameters['HotelName'];;
  }

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Book.Train', bookTrain);
  intentMap.set('Book.Train - ChangeDestination', bookTrain);
  intentMap.set('Book.Train - ChangeDate', bookTrainSelectDate);
  intentMap.set('Book.Train - SelectClass', bookTrainClass);
  intentMap.set('Book.Train - SeatNumbers', bookTrainSeatNumbers);
  intentMap.set('Book.Train - Payment', bookTrainPayment);

  intentMap.set('Payment.Complete', paymentComplete);
  intentMap.set('Payment.Complete - Hotel No', paymentCompleteButHotelNo);
  intentMap.set('Payment.Complete - Hotel Yes', paymentCompleteButHotelYes);


  intentMap.set('Book.Hotel', bookHotel);
  intentMap.set('Book.Hotel - DefaultBooking', BookHotelDefaultFlow);
  intentMap.set('Book.Hotel - AfterTrainBook', bookHotelAfterTrainBookFlow);
  intentMap.set('Book.Hotel - Select Hotel', bookHotelSelectHotel);
  intentMap.set('Book.Hotel - AfterTrainBook - yes', bookHotelAfterTrainBookYes);
  intentMap.set('Book.Hotel - AfterTrainBook - No', bookHotelAfterTrainBookNo);

  // intentMap.set('your intent name here', googleAssistantHandler);
  agent.handleRequest(intentMap);
});




  // // Uncomment and edit to make your own intent handler
  // // uncomment `intentMap.set('your intent name here', yourFunctionHandler); `
  // // below to get this function to be run when a Dialogflow intent is matched
  // function yourFunctionHandler(agent) {
  //   agent.add(`This message is from Dialogflow's Cloud Functions for Firebase editor!`);
  //   agent.add(new Card({
  //       title: `Title: this is a card title`,
  //       imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
  //       text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
  //       buttonText: 'This is a button',
  //       buttonUrl: 'https://assistant.google.com/'
  //     })
  //   );
  //   agent.add(new Suggestion(`Quick Reply`));
  //   agent.add(new Suggestion(`Suggestion`));
  //   agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' }});
  // }
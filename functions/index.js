// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
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
        getTrainTravelDateSuggestion(agent);
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
      bookTrainPayment(agent);
    }
  }

  //mapped to Book.Train - Payment intent
  function bookTrainPayment(agent) {
    console.log(logColor, '//mapped to Book.Train - Payment intent');
    console.log(logColor, agent.parameters);
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
    agent.add('Thank you for your payment! \nYour tickets have been booked and your bookingID is ' + tempBookingID);
    agent.add('Do you want to book hotel room also?');
    yesNoSuggestion(agent);
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
  function getTrainTravelDateSuggestion(agent) {
    agent.add('For when do you want to book train?');
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
    agent.add(`Hi, I am your travel planner, you can ask me to book your train-ticket or hotel room`);
    agent.add(new Suggestion(`Book a train ticket`));
    agent.add(new Suggestion(`Book a room`));
  }
  function getfulfillmentText() {
    return query.fulfillmentText;
  }
  function getTrainClass() {
    return query.parameters['Class'];
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



  // intentMap.set('your intent name here', googleAssistantHandler);
  agent.handleRequest(intentMap);
});




  // // Uncomment and edit to make your own intent handler
  // // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
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
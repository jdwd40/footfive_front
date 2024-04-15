import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Text,
  VStack,
  Heading,
  Container,
  List,
  ListItem,
  ListIcon,
  Divider,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@chakra-ui/icons';

function App() {
  const [fixtures, setFixtures] = useState([]);
  const [results, setResults] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tournamentOver, setTournamentOver] = useState(false);
  const [winner, setWinner] = useState(null);

  const fetchFixtures = async () => {
    setLoading(true);
    const response = await fetch('http://localhost:9001/api/jcup/init');
    const data = await response.json();
    setFixtures(data.fixtures[0] || []);
    setResults([]);
    setHighlights([]);
    setTournamentOver(false);
    setWinner(null);
    setLoading(false);
  };

  const simulateRound = async () => {
    setLoading(true);
    const response = await fetch('http://localhost:9001/api/jcup/play');
    const data = await response.json();
    setResults(data.results.roundResults || []);
    setHighlights(data.results.highlights || []);
    if (data.results.nextRoundFixtures === "Tournament finished, initializing new tournament.") {
      setWinner(data.results.winner);
      setTournamentOver(true);
      setFixtures([]);
    } else {
      setFixtures(data.results.nextRoundFixtures);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFixtures();
  }, []);

  return (
    <Container centerContent p={4}>
      <VStack spacing={4}>
        <Heading size="xl" mb={6}>JCup Tournament</Heading>
        {loading && <Text>Loading...</Text>}

        <VStack align="stretch" spacing={5}>
          {tournamentOver && winner ? (
            <>
              <Alert status="success" variant="subtle">
                <AlertIcon />
                <Box flex="1">
                  <AlertTitle>Champion: {winner.name}</AlertTitle>
                  <AlertDescription display="block">
                    Congratulations to {winner.name} for winning the tournament!
                  </AlertDescription>
                </Box>
              </Alert>

              <Box>
                <Text fontSize="2xl" mb={2}>Final Score:</Text>
                <Text>{results.length ? results[results.length - 1] : 'No final score available'}</Text>
              </Box>

              {highlights.length > 0 && (
                <Accordion allowToggle>
                  <AccordionItem>
                    <h2>
                      <AccordionButton>
                        <Box flex="1" textAlign="left">
                          View Match Highlights
                        </Box>
                        <AccordionIcon />
                      </AccordionButton>
                    </h2>
                    <AccordionPanel pb={4}>
                      {highlights[0].map((highlight, index) => (
                        <Text key={index}>{highlight}</Text>
                      ))}
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              )}

              <Button colorScheme="green" size="lg" onClick={fetchFixtures}>
                Restart Tournament
              </Button>
            </>
          ) : (
            <>
              <Box>
                <Text fontSize="2xl" mb={2}>Fixtures:</Text>
                <List spacing={3}>
                  {fixtures.length > 0 ? fixtures.map((fixture, index) => (
                    <ListItem key={index}>
                      <ListIcon as={CheckCircleIcon} color="green.500" />
                      {fixture.team2 ? `${fixture.team1.name} vs ${fixture.team2.name}` : `${fixture.team1.name} has a bye`}
                    </ListItem>
                  )) : <Text>No fixtures to display.</Text>}
                </List>
              </Box>
              
              <Divider />

              <Box>
                <Text fontSize="2xl" mb={2}>Results:</Text>
                <List spacing={3}>
                  {results.length > 0 ? results.map((result, index) => (
                    <ListItem key={index}>
                      <ListIcon as={CheckCircleIcon} color="blue.500" />
                      {result}
                    </ListItem>
                  )) : <Text>No results to display.</Text>}
                </List>
              </Box>
              <Button colorScheme="teal" size="lg" onClick={simulateRound} isDisabled={loading}>
                {results.length ? 'Next Round' : 'Start Round'}
              </Button>
            </>
          )}
        </VStack>
      </VStack>
    </Container>
  );
}

export default App;

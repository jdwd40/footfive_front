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
  Divider
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@chakra-ui/icons';

function App() {
  const [fixtures, setFixtures] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tournamentOver, setTournamentOver] = useState(false);

  const fetchFixtures = async () => {
    setLoading(true);
    const response = await fetch('http://localhost:9001/api/jcup/init');
    const data = await response.json();
    setFixtures(data.fixtures[0] || []);
    setResults([]);
    setTournamentOver(false);
    setLoading(false);
  };

  const simulateRound = async () => {
    setLoading(true);
    const response = await fetch('http://localhost:9001/api/jcup/play');
    const data = await response.json();
    setResults(data.results.roundResults || []);
    if (!data.results.nextRoundFixtures.length || (data.results.nextRoundFixtures.length === 1 && data.results.nextRoundFixtures[0].team2 === null)) {
      setTournamentOver(true);  // No more matches to play, tournament is over
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
        {loading ? <Text>Loading...</Text> : (
          <>
            <VStack align="stretch" spacing={5}>
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
            </VStack>

            {tournamentOver ? (
              <Button colorScheme="green" size="lg" onClick={fetchFixtures}>
                Restart Tournament
              </Button>
            ) : (
              <Button colorScheme="teal" size="lg" onClick={simulateRound} isDisabled={loading}>
                {results.length ? 'Next Round' : 'Start Round'}
              </Button>
            )}
          </>
        )}
      </VStack>
    </Container>
  );
}

export default App;

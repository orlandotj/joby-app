import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { formatPriceUnit } from '@/lib/priceUnit'

const ProfessionalCard = ({ professional }) => {
  const avatarSrc = useResolvedStorageUrl(professional?.avatar)
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Link to={`/profile/${professional.id}`}>
        <Card className="hover:shadow-xl transition-shadow duration-300 ease-in-out bg-card border-border/50 rounded-lg overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Avatar className="h-14 w-14">
                <AvatarImage src={avatarSrc} alt={professional.name} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {professional.name.charAt(0)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {professional.name}
                    </h3>
                    <p className="text-sm text-primary">
                      {professional.profession}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">
                      R$ {professional.price}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      /{formatPriceUnit(professional.priceUnit)}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                  {professional.description}
                </p>

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center">
                    <div className="flex items-center text-yellow-500 mr-1">
                      <Star size={16} fill="currentColor" />
                      <span className="text-sm font-medium ml-1">
                        {professional.rating}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ({professional.reviews} avaliações)
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {professional.location}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}

export default ProfessionalCard
